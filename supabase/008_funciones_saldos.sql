-- Fase 2 (sistema de saldos): funciones (RPC) que mutan los saldos de forma
-- ATÓMICA y validan los fondos del lado del servidor. La app las llama con
-- supabase.rpc(...). Cada función corre en una sola transacción: si algo falla
-- (ej. fondos insuficientes), no queda nada a medias.
--
-- Correr en el SQL Editor de Supabase DESPUÉS de 007_cuentas_y_movimientos.sql.
-- Es re-ejecutable (create or replace): si hay que corregir una función, se
-- vuelve a correr este archivo sin problema.
--
-- Los errores de fondos se levantan como 'FONDOS_INSUFICIENTES:<cuenta>' para
-- que la app muestre el mensaje contextual y el botón de depositar.

-- Estado de liquidación de los plazos fijos (para no acreditarlos dos veces).
alter table plazos_fijos
  add column if not exists estado text not null default 'pendiente'
  check (estado in ('pendiente', 'liquidado'));

-- ---------------------------------------------------------------------------
-- Helper: valida que el portafolio sea del usuario logueado.
-- ---------------------------------------------------------------------------
create or replace function assert_portafolio_propio(p_portafolio_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from portafolios
    where id = p_portafolio_id and user_id = auth.uid()
  ) then
    raise exception 'PORTAFOLIO_NO_AUTORIZADO';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Saldo inicial ("cargá tus saldos de hoy"): fija el Disponible de una cuenta.
-- ---------------------------------------------------------------------------
create or replace function set_saldo_inicial(
  p_portafolio_id uuid, p_cuenta text, p_monto numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform assert_portafolio_propio(p_portafolio_id);
  if p_monto < 0 then raise exception 'MONTO_INVALIDO'; end if;

  insert into cuentas_saldos (portafolio_id, cuenta, disponible, updated_at)
  values (p_portafolio_id, p_cuenta, p_monto, now())
  on conflict (portafolio_id, cuenta)
    do update set disponible = excluded.disponible, updated_at = now();

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas)
  values (p_portafolio_id, p_cuenta, 'ajuste_inicial', p_monto, current_date,
          'Saldo inicial cargado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Depósito / retiro manual del Disponible de una cuenta.
-- ---------------------------------------------------------------------------
create or replace function registrar_movimiento_cuenta(
  p_portafolio_id uuid, p_cuenta text, p_tipo text,
  p_monto numeric, p_fecha date, p_notas text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_disponible numeric;
  v_delta numeric;
begin
  perform assert_portafolio_propio(p_portafolio_id);
  if p_tipo not in ('deposito', 'retiro') then raise exception 'TIPO_INVALIDO'; end if;
  if p_monto <= 0 then raise exception 'MONTO_INVALIDO'; end if;

  select disponible into v_disponible from cuentas_saldos
    where portafolio_id = p_portafolio_id and cuenta = p_cuenta for update;
  if not found then
    v_disponible := 0;
    insert into cuentas_saldos (portafolio_id, cuenta, disponible)
      values (p_portafolio_id, p_cuenta, 0);
  end if;

  if p_tipo = 'deposito' then
    v_delta := p_monto;
  else
    if v_disponible < p_monto then raise exception 'FONDOS_INSUFICIENTES:%', p_cuenta; end if;
    v_delta := -p_monto;
  end if;

  update cuentas_saldos set disponible = disponible + v_delta, updated_at = now()
    where portafolio_id = p_portafolio_id and cuenta = p_cuenta;

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas)
  values (p_portafolio_id, p_cuenta, p_tipo, v_delta, coalesce(p_fecha, current_date), p_notas);
end;
$$;

-- ---------------------------------------------------------------------------
-- Abrir operación: valida fondos, inserta la operación y debita el Disponible
-- de la cuenta correspondiente, todo atómico. Devuelve el id de la operación.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Cerrar operación (total o parcial): acredita los proceeds al Disponible y
-- registra el cierre. Reemplaza el doble-write no atómico del cliente.
--   proceeds = costo de la porción cerrada + P&L de esa porción
--   (para spot/acciones equivale a cantidad_cerrada * precio_salida).
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
  select * into op from operaciones where id = p_op_id;
  if not found then raise exception 'OPERACION_NO_ENCONTRADA'; end if;
  perform assert_portafolio_propio(op.portafolio_id);
  if op.estado <> 'abierta' then raise exception 'OPERACION_YA_CERRADA'; end if;
  if p_cantidad_cerrada <= 0 or p_cantidad_cerrada > op.cantidad then
    raise exception 'CANTIDAD_INVALIDA';
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
-- Abrir plazo fijo: valida fondos, inserta el plazo y debita el capital.
-- ---------------------------------------------------------------------------
create or replace function abrir_plazo_fijo(
  p_portafolio_id uuid, p_monto numeric, p_divisa text, p_tasa_tna numeric,
  p_plazo_dias integer, p_fecha_inicio date, p_fecha_vencimiento date,
  p_interes_estimado numeric, p_notas text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cuenta text;
  v_disponible numeric;
  v_id uuid;
begin
  perform assert_portafolio_propio(p_portafolio_id);
  v_cuenta := case when p_divisa = 'ARS' then 'ars' else 'usd' end;

  select disponible into v_disponible from cuentas_saldos
    where portafolio_id = p_portafolio_id and cuenta = v_cuenta for update;
  if not found then v_disponible := 0; end if;
  if v_disponible < p_monto then raise exception 'FONDOS_INSUFICIENTES:%', v_cuenta; end if;

  insert into plazos_fijos (portafolio_id, monto, divisa, tasa_tna, plazo_dias,
    fecha_inicio, fecha_vencimiento, interes_estimado, notas, estado)
  values (p_portafolio_id, p_monto, p_divisa, p_tasa_tna, p_plazo_dias,
    p_fecha_inicio, p_fecha_vencimiento, p_interes_estimado, p_notas, 'pendiente')
  returning id into v_id;

  insert into cuentas_saldos (portafolio_id, cuenta, disponible)
    values (p_portafolio_id, v_cuenta, -p_monto)
  on conflict (portafolio_id, cuenta)
    do update set disponible = cuentas_saldos.disponible - p_monto, updated_at = now();

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas, ref_operacion_id)
  values (p_portafolio_id, v_cuenta, 'plazo_apertura', -p_monto, p_fecha_inicio, 'Plazo fijo', v_id);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liquidar plazo fijo: acredita capital + interés al Disponible y lo marca
-- como liquidado (para no acreditarlo dos veces).
-- ---------------------------------------------------------------------------
create or replace function liquidar_plazo_fijo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  pf plazos_fijos%rowtype;
  v_cuenta text;
  v_total numeric;
begin
  select * into pf from plazos_fijos where id = p_id;
  if not found then raise exception 'PLAZO_NO_ENCONTRADO'; end if;
  perform assert_portafolio_propio(pf.portafolio_id);
  if pf.estado = 'liquidado' then raise exception 'PLAZO_YA_LIQUIDADO'; end if;

  v_cuenta := case when pf.divisa = 'ARS' then 'ars' else 'usd' end;
  v_total := pf.monto + pf.interes_estimado;

  update plazos_fijos set estado = 'liquidado' where id = pf.id;

  insert into cuentas_saldos (portafolio_id, cuenta, disponible)
    values (pf.portafolio_id, v_cuenta, v_total)
  on conflict (portafolio_id, cuenta)
    do update set disponible = cuentas_saldos.disponible + v_total, updated_at = now();

  insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas, ref_operacion_id)
  values (pf.portafolio_id, v_cuenta, 'plazo_liquidacion', v_total, current_date,
          'Liquidación plazo fijo', pf.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: los usuarios autenticados pueden ejecutar estas funciones.
-- ---------------------------------------------------------------------------
grant execute on function set_saldo_inicial(uuid, text, numeric) to authenticated;
grant execute on function registrar_movimiento_cuenta(uuid, text, text, numeric, date, text) to authenticated;
grant execute on function abrir_operacion(uuid, text, text, text, text, numeric, text, date, numeric, numeric, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function cerrar_operacion(uuid, numeric, date, numeric) to authenticated;
grant execute on function abrir_plazo_fijo(uuid, numeric, text, numeric, integer, date, date, numeric, text) to authenticated;
grant execute on function liquidar_plazo_fijo(uuid) to authenticated;
