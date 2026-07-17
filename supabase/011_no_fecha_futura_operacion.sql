-- Rechaza abrir/cerrar operaciones con fecha futura, mismo criterio que ya
-- se aplica a depósitos/retiros (010_no_fecha_futura_movimiento.sql): una
-- operación "del futuro" ensucia el historial y no tiene caso de uso real.
-- Se valida también en el cliente (input date con max=hoy), esto es la red
-- de seguridad del lado del servidor.
--
-- Re-ejecutable (create or replace). Correr en el SQL Editor de Supabase
-- DESPUÉS de 010_no_fecha_futura_movimiento.sql.

create or replace function abrir_operacion(
  p_portafolio_id uuid,
  p_activo text,
  p_tipo_activo text,
  p_sub_tipo_activo text,
  p_divisa text,
  p_apalancamiento numeric,
  p_tipo_operacion text,
  p_fecha_entrada date,
  p_precio_entrada numeric,
  p_precio_stop_loss numeric,
  p_precio_take_profit numeric,
  p_cantidad numeric,
  p_ratio_riesgo_beneficio numeric,
  p_porcentaje_riesgo numeric,
  p_notas text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cuenta text;
  v_costo numeric;
  v_disponible numeric;
  v_op_id uuid;
begin
  perform assert_portafolio_propio(p_portafolio_id);
  if p_fecha_entrada > current_date then raise exception 'FECHA_FUTURA'; end if;

  if p_tipo_activo = 'acciones' then
    v_cuenta := case when p_sub_tipo_activo = 'cedear' then 'ars' else 'usd' end;
  else
    v_cuenta := case when p_sub_tipo_activo = 'futuros' then 'usdt_futuros' else 'usdt_spot' end;
  end if;

  -- capital comprometido = cantidad * precio / apalancamiento
  v_costo := (p_cantidad * p_precio_entrada) / greatest(coalesce(p_apalancamiento, 1), 1);

  select disponible into v_disponible from cuentas_saldos
    where portafolio_id = p_portafolio_id and cuenta = v_cuenta for update;
  if not found then v_disponible := 0; end if;
  if v_disponible < v_costo then raise exception 'FONDOS_INSUFICIENTES:%', v_cuenta; end if;

  insert into operaciones (
    portafolio_id, activo, tipo_activo, sub_tipo_activo, divisa, apalancamiento,
    tipo_operacion, fecha_entrada, precio_entrada, precio_stop_loss, precio_take_profit,
    cantidad, estado, ratio_riesgo_beneficio, porcentaje_riesgo_cuenta, notas
  ) values (
    p_portafolio_id, p_activo, p_tipo_activo, p_sub_tipo_activo, p_divisa, p_apalancamiento,
    p_tipo_operacion, p_fecha_entrada, p_precio_entrada, p_precio_stop_loss, p_precio_take_profit,
    p_cantidad, 'abierta', p_ratio_riesgo_beneficio, p_porcentaje_riesgo, p_notas
  ) returning id into v_op_id;

  insert into cuentas_saldos (portafolio_id, cuenta, disponible)
    values (p_portafolio_id, v_cuenta, -v_costo)
  on conflict (portafolio_id, cuenta)
    do update set disponible = cuentas_saldos.disponible - v_costo, updated_at = now();

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas, ref_operacion_id)
  values (p_portafolio_id, v_cuenta, 'apertura', -v_costo, p_fecha_entrada, p_activo, v_op_id);

  return v_op_id;
end;
$$;

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
  select * into op from operaciones where id = p_op_id;
  if not found then raise exception 'OPERACION_NO_ENCONTRADA'; end if;
  perform assert_portafolio_propio(op.portafolio_id);
  if op.estado <> 'abierta' then raise exception 'OPERACION_YA_CERRADA'; end if;
  if p_cantidad_cerrada <= 0 or p_cantidad_cerrada > op.cantidad then
    raise exception 'CANTIDAD_INVALIDA';
  end if;
  if p_fecha_salida > current_date then raise exception 'FECHA_FUTURA'; end if;

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
