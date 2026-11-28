-- Bloqueo de fila en las RPC que cambian el estado de una operación o de un
-- plazo fijo.
--
-- `cerrar_operacion` y `liquidar_plazo_fijo` leían el registro sin bloquearlo,
-- validaban su estado y recién después lo modificaban. Con `for update` en esa
-- lectura, las llamadas sobre un mismo registro se atienden de a una y cada una
-- valida contra lo que dejó la anterior. Es el mismo criterio que ya usan
-- `registrar_movimiento_cuenta`, `abrir_operacion` y `abrir_plazo_fijo` con la
-- fila del saldo.
--
-- Son las funciones de 016 (cerrar_operacion) y 018 (liquidar_plazo_fijo): lo
-- único que cambia en cada una es ese `for update`. Firma, validaciones y
-- permisos quedan iguales.
--
-- No necesitan cambios:
--   * set_saldo_inicial: no decide nada a partir de una lectura previa. Escribe
--     un valor absoluto con un único `insert ... on conflict do update`, que ya
--     bloquea la fila.
--   * delete_own_account: es un único `delete` por `auth.uid()`; repetirlo no
--     encuentra filas y no mueve saldos.
--
-- No corrige datos. En verificacion.sql, la consulta 10 confirma que se aplicó y
-- la 11 revisa los movimientos existentes.
--
-- Re-ejecutable (create or replace). Correr en el SQL Editor de Supabase DESPUÉS
-- de 022_permisos_minimos_tablas.sql. Si alguna vez se vuelve a correr 016 o 018,
-- hay que correr esta de nuevo: reemplazan las funciones por la versión vieja.

-- ---------------------------------------------------------------------------
-- Cerrar operación (total o parcial).
-- ---------------------------------------------------------------------------
create or replace function cerrar_operacion(
  p_op_id uuid, p_precio_salida numeric, p_fecha_salida date, p_cantidad_cerrada numeric
) returns void language plpgsql security definer set search_path = public as $$
declare
  op operaciones%rowtype;
  v_cuenta text;
  v_apal numeric;
  v_pnl numeric;
  v_costo_portion numeric;
  v_proceeds numeric;
begin
  select * into op from operaciones where id = p_op_id for update;
  if not found then raise exception 'OPERACION_NO_ENCONTRADA'; end if;
  perform assert_portafolio_propio(op.portafolio_id);
  if op.estado <> 'abierta' then raise exception 'OPERACION_YA_CERRADA'; end if;
  if p_cantidad_cerrada <= 0 or p_cantidad_cerrada > op.cantidad then
    raise exception 'CANTIDAD_INVALIDA';
  end if;
  if p_fecha_salida > current_date then raise exception 'FECHA_FUTURA'; end if;
  if p_fecha_salida < op.fecha_entrada then raise exception 'FECHA_INVALIDA'; end if;
  if p_precio_salida is null or p_precio_salida <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

  if op.tipo_activo = 'acciones' then
    v_cuenta := case when op.sub_tipo_activo = 'cedear' then 'ars' else 'usd' end;
  else
    v_cuenta := case when op.sub_tipo_activo = 'futuros' then 'usdt_futuros' else 'usdt_spot' end;
  end if;
  v_apal := greatest(coalesce(op.apalancamiento, 1), 1);

  v_pnl := case when op.tipo_operacion = 'long'
                then (p_precio_salida - op.precio_entrada)
                else (op.precio_entrada - p_precio_salida) end * p_cantidad_cerrada;
  v_costo_portion := (p_cantidad_cerrada * op.precio_entrada) / v_apal;
  v_proceeds := v_costo_portion + v_pnl;

  if p_cantidad_cerrada >= op.cantidad then
    update operaciones set estado = 'cerrada', fecha_salida = p_fecha_salida,
      precio_salida = p_precio_salida, resultado_pnl = v_pnl
    where id = op.id;
  else
    update operaciones set cantidad = cantidad - p_cantidad_cerrada where id = op.id;
    insert into operaciones (
      portafolio_id, activo, tipo_activo, sub_tipo_activo, divisa, apalancamiento,
      tipo_operacion, fecha_entrada, precio_entrada, precio_stop_loss, precio_take_profit,
      cantidad, estado, fecha_salida, precio_salida, resultado_pnl,
      ratio_riesgo_beneficio, porcentaje_riesgo_cuenta, notas
    ) values (
      op.portafolio_id, op.activo, op.tipo_activo, op.sub_tipo_activo, op.divisa, op.apalancamiento,
      op.tipo_operacion, op.fecha_entrada, op.precio_entrada, op.precio_stop_loss, op.precio_take_profit,
      p_cantidad_cerrada, 'cerrada', p_fecha_salida, p_precio_salida, v_pnl,
      op.ratio_riesgo_beneficio, op.porcentaje_riesgo_cuenta, op.notas
    );
  end if;

  insert into cuentas_saldos (portafolio_id, cuenta, disponible)
    values (op.portafolio_id, v_cuenta, v_proceeds)
  on conflict (portafolio_id, cuenta)
    do update set disponible = cuentas_saldos.disponible + v_proceeds, updated_at = now();

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas, ref_operacion_id)
  values (op.portafolio_id, v_cuenta, 'cierre', v_proceeds, p_fecha_salida, op.activo, op.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Liquidar plazo fijo.
-- ---------------------------------------------------------------------------
create or replace function liquidar_plazo_fijo(p_id uuid, p_interes_real numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  pf plazos_fijos%rowtype;
  v_cuenta text;
  v_interes numeric;
  v_total numeric;
begin
  select * into pf from plazos_fijos where id = p_id for update;
  if not found then raise exception 'PLAZO_NO_ENCONTRADO'; end if;
  perform assert_portafolio_propio(pf.portafolio_id);
  if pf.estado = 'liquidado' then raise exception 'PLAZO_YA_LIQUIDADO'; end if;

  if p_interes_real is not null and p_interes_real < 0 then
    raise exception 'INTERES_INVALIDO';
  end if;

  v_interes := coalesce(p_interes_real, pf.interes_estimado);
  v_cuenta := case when pf.divisa = 'ARS' then 'ars' else 'usd' end;
  v_total := pf.monto + v_interes;

  -- Se persiste el interés real usado (no el proyectado original) para que
  -- el Historial reporte la rentabilidad que efectivamente se acreditó.
  update plazos_fijos set estado = 'liquidado', interes_estimado = v_interes where id = pf.id;

  insert into cuentas_saldos (portafolio_id, cuenta, disponible)
    values (pf.portafolio_id, v_cuenta, v_total)
  on conflict (portafolio_id, cuenta)
    do update set disponible = cuentas_saldos.disponible + v_total, updated_at = now();

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas, ref_operacion_id)
  values (pf.portafolio_id, v_cuenta, 'plazo_liquidacion', v_total, current_date,
          'Liquidación plazo fijo', pf.id);
end;
$$;

-- `create or replace` conserva los permisos; se dejan explícitos (mismo estado
-- que fija 019) para que no dependan de lo que hubiera antes en la base.
revoke all on function public.cerrar_operacion(uuid, numeric, date, numeric)
  from public, anon;
revoke all on function public.liquidar_plazo_fijo(uuid, numeric)
  from public, anon;
grant execute on function public.cerrar_operacion(uuid, numeric, date, numeric)
  to authenticated;
grant execute on function public.liquidar_plazo_fijo(uuid, numeric)
  to authenticated;
