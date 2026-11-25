-- Permisos mínimos sobre las tablas del schema public (OPS-US-15).
--
-- Contexto: la migración 017 otorgó select/insert/update/delete a anon,
-- authenticated y service_role para que el repo pudiera recrear su base. Pero en
-- la nube los "default privileges" de Supabase ya le daban ADEMÁS truncate,
-- references y trigger a anon y authenticated, y nunca se revocaron. Resultado
-- medido en producción el 2026-11-25: las 6 tablas tenían los 7 privilegios para
-- los dos roles.
--
-- RLS filtra FILAS, pero TRUNCATE no pasa por RLS. La API de Supabase no lo
-- expone, así que el riesgo era bajo; esto es defensa en profundidad, el mismo
-- criterio que la migración 019 aplicó a las funciones.
--
-- Qué queda:
--   anon           -> nada. La app solo lo usa para login/registro/recuperación,
--                     que hablan con Auth y no con las tablas (verificado: toda
--                     lectura o escritura de tablas sale con la sesión del
--                     usuario, o sea con el rol authenticated).
--   authenticated  -> select, insert, update y delete (RLS sigue de guardia).
--   service_role   -> sin cambios.
--
-- Se usa `revoke all` + `grant` en vez de revocar uno por uno: cubre también
-- privilegios que existen solo en algunas versiones de Postgres (maintain, en la
-- 17) y deja local y nube idénticos sin importar el rol que creó las tablas.
--
-- Las funciones security definer (handle_new_user, las RPC, delete_own_account)
-- corren con los permisos de su dueño, no con los de anon ni authenticated, así
-- que no dependen de lo que se revoca acá.
--
-- Ojo, para tablas FUTURAS: los default privileges de Supabase vuelven a darle
-- todo a anon y authenticated. Toda tabla nueva necesita su propio revoke.

revoke all on table portafolios          from anon, authenticated;
revoke all on table operaciones          from anon, authenticated;
revoke all on table plazos_fijos         from anon, authenticated;
revoke all on table cuentas_saldos       from anon, authenticated;
revoke all on table movimientos_cuenta   from anon, authenticated;
revoke all on table preferencias_usuario from anon, authenticated;

grant select, insert, update, delete on table portafolios          to authenticated;
grant select, insert, update, delete on table operaciones          to authenticated;
grant select, insert, update, delete on table plazos_fijos         to authenticated;
grant select, insert, update, delete on table cuentas_saldos       to authenticated;
grant select, insert, update, delete on table movimientos_cuenta   to authenticated;
grant select, insert, update, delete on table preferencias_usuario to authenticated;

-- Las secuencias: hoy no hay (las PK son uuid). anon no necesita ninguna.
revoke all on all sequences in schema public from anon;
