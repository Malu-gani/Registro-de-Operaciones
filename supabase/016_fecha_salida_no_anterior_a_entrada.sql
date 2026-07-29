-- Rechaza cerrar una operación con fecha de salida anterior a la de entrada
-- (defecto 9.4 del spec de la suite de pruebas).
--
-- `cerrar_operacion` solo validaba contra `current_date` (migración 011, que
-- frena las fechas futuras), nunca contra `op.fecha_entrada`. O sea que se podía
-- cerrar una operación **antes de haberla abierto**: el P&L quedaba fechado en
-- un día en el que la posición todavía no existía, y el historial y la curva de
-- equity mostraban un resultado fuera de orden.
--
-- Es el mismo tipo de descuido que el 9.1/9.5 (ver 015): la función confiaba en
-- que el cliente mandara parámetros coherentes. El modal ya no deja elegir esa
-- fecha, pero la RPC está otorgada a `authenticated` y se puede llamar directo.
--
-- Esta es la misma función que en 015, con la guarda nueva. Re-ejecutable
-- (create or replace). Correr en el SQL Editor de Supabase DESPUÉS de
-- 015_validar_parametros_rpc.sql.

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
