-- OPS-BUG-04 / OPS-US-04: liquidar_plazo_fijo ahora acepta un interés real
-- opcional, distinto al estimado al abrir el plazo (flujo "rentabilidad
-- personalizada" del modal de liquidación, cuando el interés pactado no se
-- cumplió tal cual). Si no se pasa, se usa el interés estimado original
-- (comportamiento anterior).
--
-- Cambia la firma de (uuid) a (uuid, numeric): CREATE OR REPLACE no
-- reemplaza una función cuando cambian los tipos de parámetros, crea una
-- SEGUNDA función superpuesta y deja la vieja de un solo argumento viva. Por
-- eso se dropea explícitamente antes de recrear.
drop function if exists liquidar_plazo_fijo(uuid);

create or replace function liquidar_plazo_fijo(p_id uuid, p_interes_real numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  pf plazos_fijos%rowtype;
  v_cuenta text;
  v_interes numeric;
  v_total numeric;
begin
  select * into pf from plazos_fijos where id = p_id;
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

grant execute on function liquidar_plazo_fijo(uuid, numeric) to authenticated;
