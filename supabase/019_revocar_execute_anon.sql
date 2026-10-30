-- Revoca EXECUTE a `anon` sobre las funciones SECURITY DEFINER del esquema
-- public (advertencias `anon_security_definer_function_executable` del
-- Security Advisor, 2026-10-30).
--
-- QUÉ PASABA: Postgres otorga EXECUTE a PUBLIC por defecto en toda función
-- nueva. Como `anon` es miembro de PUBLIC, cualquiera sin iniciar sesión podía
-- invocar estas funciones por `/rest/v1/rpc/<nombre>`. Y son SECURITY DEFINER,
-- o sea que corren con los permisos del dueño y saltean RLS.
--
-- POR QUÉ NO ERA EXPLOTABLE: todas pasan por `assert_portafolio_propio()`, que
-- exige `user_id = auth.uid()`. Para un anónimo `auth.uid()` es NULL, así que
-- la consulta no encuentra fila y corta con PORTAFOLIO_NO_AUTORIZADO.
-- `handle_new_user()` ni siquiera es invocable: devuelve `trigger`, y Postgres
-- rechaza llamar por RPC a una función de trigger.
--
-- POR QUÉ SE ARREGLA IGUAL: hoy el guardia está DENTRO de la función. El
-- anónimo entra, ejecuta código y recién ahí lo frenan. Revocar el permiso lo
-- frena en la puerta, y deja de depender de que cada función futura se acuerde
-- de llamar al assert. Es defensa en profundidad, no un parche de un agujero.
--
-- El patrón no es nuevo acá: `013_borrar_cuenta.sql` ya hace exactamente esto
-- con `delete_own_account()`. Por eso esa función aparece solo en la lista de
-- autenticados del Advisor y no en la de anónimos. Esta migración replica ese
-- mismo patrón al resto, que nunca lo recibió.
--
-- NO se toca `authenticated`: la app llama estas RPC como usuario logueado, así
-- que revocarle EXECUTE rompería la aplicación entera. Las advertencias
-- `authenticated_security_definer_function_executable` del Advisor describen el
-- diseño buscado, no un defecto.

-- ---------------------------------------------------------------------------
-- Funciones de la API: las llama la app con sesión iniciada.
-- ---------------------------------------------------------------------------
revoke all on function public.abrir_operacion(
  uuid, text, text, text, text, numeric, text, date, numeric, numeric,
  numeric, numeric, numeric, numeric, text
) from public, anon;

revoke all on function public.abrir_plazo_fijo(
  uuid, numeric, text, numeric, integer, date, date, numeric, text
) from public, anon;

revoke all on function public.cerrar_operacion(
  uuid, numeric, date, numeric
) from public, anon;

revoke all on function public.liquidar_plazo_fijo(
  uuid, numeric
) from public, anon;

revoke all on function public.registrar_movimiento_cuenta(
  uuid, text, text, numeric, date, text
) from public, anon;

revoke all on function public.set_saldo_inicial(
  uuid, text, numeric
) from public, anon;

-- `revoke ... from public` también le saca el permiso a `authenticated` en la
-- medida en que lo heredaba de PUBLIC, así que hay que re-otorgarlo explícito.
-- Mismo criterio que la 013: lo que la app necesita, otorgado a propósito.
grant execute on function public.abrir_operacion(
  uuid, text, text, text, text, numeric, text, date, numeric, numeric,
  numeric, numeric, numeric, numeric, text
) to authenticated;

grant execute on function public.abrir_plazo_fijo(
  uuid, numeric, text, numeric, integer, date, date, numeric, text
) to authenticated;

grant execute on function public.cerrar_operacion(
  uuid, numeric, date, numeric
) to authenticated;

grant execute on function public.liquidar_plazo_fijo(
  uuid, numeric
) to authenticated;

grant execute on function public.registrar_movimiento_cuenta(
  uuid, text, text, numeric, date, text
) to authenticated;

grant execute on function public.set_saldo_inicial(
  uuid, text, numeric
) to authenticated;

-- ---------------------------------------------------------------------------
-- Funciones internas: NO son parte de la API. Nadie las llama desde afuera.
-- ---------------------------------------------------------------------------
-- `assert_portafolio_propio` es la guarda que usan las de arriba. Se le revoca
-- también a `authenticated`: las funciones SECURITY DEFINER que la invocan
-- corren como su dueño, así que el permiso se evalúa contra el dueño y las
-- llamadas internas siguen funcionando.
revoke all on function public.assert_portafolio_propio(uuid)
  from public, anon, authenticated;

-- `handle_new_user` es la función del trigger `on_auth_user_created` sobre
-- auth.users. Un trigger no ejecuta por el EXECUTE del usuario que dispara la
-- operación, así que revocarlo no lo afecta.
revoke all on function public.handle_new_user()
  from public, anon, authenticated;
