-- Rechaza depósitos/retiros con fecha futura: adelantar la fecha de un
-- movimiento manual ensucia el historial (aparecería un movimiento "del
-- futuro") sin ningún caso de uso real. Se valida también en el cliente
-- (input date con max=hoy), esto es la red de seguridad del lado del servidor.
--
-- Re-ejecutable (create or replace). Correr en el SQL Editor de Supabase
-- DESPUÉS de 008_funciones_saldos.sql.

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
  if coalesce(p_fecha, current_date) > current_date then raise exception 'FECHA_FUTURA'; end if;

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
