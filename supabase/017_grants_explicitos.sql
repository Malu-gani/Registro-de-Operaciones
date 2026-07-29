-- Permisos (GRANT) explícitos sobre las tablas del esquema public (defecto 9.10
-- del spec de la suite de pruebas).
--
-- El problema: ni schema.sql ni ninguna migración le otorga jamás
-- select/insert/update/delete a los roles de Supabase (anon, authenticated,
-- service_role). El proyecto venía HEREDANDO esos permisos del entorno.
--
-- En la nube funciona de casualidad: Supabase corre el SQL del dashboard como
-- un rol (supabase_admin) cuyos "default privileges" ya le dan arwdDxtm a esos
-- tres roles a toda tabla nueva del schema public. Por eso nunca se notó.
--
-- Pero al recrear la base desde cero con el rol `postgres` (una instalación
-- limpia, la base local de la suite, cualquier restore), las tablas quedan con
-- solo Dxtm y SIN select/insert/update/delete. Resultado: toda la app es
-- invisible para sus propios usuarios, con "permission denied for table
-- portafolios". Ojo que NO es RLS: RLS filtra filas y como mucho devuelve vacío;
-- un GRANT faltante tira error antes de llegar siquiera a evaluar la política.
--
-- O sea: el repo no era autosuficiente para reconstruir su propia base. Esta
-- migración vuelve explícito lo que antes era un default del entorno.
--
-- Es seguro otorgar a los tres roles: RLS está activo en todas estas tablas y
-- las políticas exigen auth.uid(), así que anon (sin sesión) no ve ni escribe
-- nada igual. El GRANT abre la puerta; RLS sigue siendo el guardia. Se otorga a
-- los mismos tres roles que la nube para que local y producción no divergan
-- —que es, justamente, la clase de bug que este 9.10 representa.

grant select, insert, update, delete on table portafolios         to anon, authenticated, service_role;
grant select, insert, update, delete on table operaciones         to anon, authenticated, service_role;
grant select, insert, update, delete on table plazos_fijos        to anon, authenticated, service_role;
grant select, insert, update, delete on table cuentas_saldos      to anon, authenticated, service_role;
grant select, insert, update, delete on table movimientos_cuenta  to anon, authenticated, service_role;
grant select, insert, update, delete on table preferencias_usuario to anon, authenticated, service_role;

-- Por si alguna tabla usa secuencias (identity/serial) ahora o más adelante.
-- Si no hay ninguna, el grant no hace nada. Las PK actuales son uuid, así que
-- hoy esto es defensivo.
grant usage, select on all sequences in schema public to anon, authenticated, service_role;
