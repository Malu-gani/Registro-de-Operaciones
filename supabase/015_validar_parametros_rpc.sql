-- Validación de parámetros en las RPC que mueven plata (defectos 9.1, 9.5 y 9.2
-- del spec de la suite de pruebas).
--
-- El problema: `abrir_operacion`, `cerrar_operacion` y `abrir_plazo_fijo` son
-- `security definer` y están otorgadas a `authenticated`, o sea que cualquier
-- usuario logueado las puede llamar directo con `supabase.rpc(...)` sin pasar
-- por el formulario. Confiaban en que los números llegaran con signo sensato:
--
--   * 9.1 (P0) — `abrir_operacion` con `p_cantidad` negativa: el costo daba
--     negativo, la guarda `if v_disponible < v_costo` pasaba siempre y
--     `disponible - v_costo` SUMABA al saldo. Medido: 1.000 USD → 101.000 con
--     una sola llamada.
--   * 9.5 (P0) — `cerrar_operacion` con `p_precio_salida` negativo: en un short
--     inflaba el P&L (16.000 desde 4.900) y en un long dejaba el disponible en
--     NEGATIVO, rompiendo la invariante que `FONDOS_INSUFICIENTES` defiende en
--     todo el resto del sistema.
--   * 9.2 (P3) — `abrir_plazo_fijo` con `p_monto` negativo: acá el
--     `check (monto > 0)` de `plazos_fijos` ya frenaba el INSERT y revertía la
--     transacción, así que no creaba dinero; lo que fallaba era la CALIDAD del
--     rechazo (error crudo de Postgres que la app no puede traducir).
--
-- El patrón correcto ya existía en `set_saldo_inicial` y en
-- `registrar_movimiento_cuenta` (008_funciones_saldos.sql): solo no se había
-- aplicado en estas tres.
--
-- Dos capas, a propósito: la guarda en la función protege de la llamada directa
-- a la RPC; el `check` de columna protege de cualquier otra vía de escritura,
-- incluidas las que todavía no existen. Es exactamente la capa que evitó que el
-- 9.2 fuera un P0.
--
-- Re-ejecutable (create or replace). Correr en el SQL Editor de Supabase
-- DESPUÉS de 014_nombre_portafolio_unico.sql.

-- ---------------------------------------------------------------------------
-- 1. Checks de columna en `operaciones`, replicando los que `plazos_fijos` ya
--    tiene. Si la tabla tuviera filas inválidas el ALTER falla; antes de correr
--    esto conviene verificar que no haya ninguna:
--
--      select count(*) from operaciones
--       where cantidad <= 0
--          or precio_entrada <= 0
--          or (precio_salida is not null and precio_salida <= 0);
--
--    Tiene que dar 0. Si no, hay que corregir esas filas primero.
-- ---------------------------------------------------------------------------
alter table operaciones
  drop constraint if exists operaciones_cantidad_check,
  add constraint operaciones_cantidad_check check (cantidad > 0);

alter table operaciones
  drop constraint if exists operaciones_precio_entrada_check,
  add constraint operaciones_precio_entrada_check check (precio_entrada > 0);

alter table operaciones
  drop constraint if exists operaciones_precio_salida_check,
  add constraint operaciones_precio_salida_check
    check (precio_salida is null or precio_salida > 0);

-- ---------------------------------------------------------------------------
-- 2. `abrir_operacion` — misma función que en 011, con las guardas de cantidad
--    y precio de entrada agregadas arriba de todo.
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
  if p_fecha_entrada > current_date then raise exception 'FECHA_FUTURA'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'MONTO_INVALIDO'; end if;
  if p_precio_entrada is null or p_precio_entrada <= 0 then
    raise exception 'MONTO_INVALIDO';
  end if;

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
-- 3. `cerrar_operacion` — misma función que en 011, con la guarda del precio de
--    salida. La cantidad cerrada ya se validaba (CANTIDAD_INVALIDA).
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
  if p_fecha_salida > current_date then raise exception 'FECHA_FUTURA'; end if;
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
-- 4. `abrir_plazo_fijo` — misma función que en 008, con la guarda del monto.
--    Acá el rechazo ya existía por el `check` de la tabla; lo que cambia es que
--    ahora devuelve MONTO_INVALIDO, que la app sí puede traducir.
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
  if p_monto is null or p_monto <= 0 then raise exception 'MONTO_INVALIDO'; end if;

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
