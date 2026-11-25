-- Consultas de VERIFICACIÓN de la base (solo lectura: ninguna modifica nada).
--
-- Para qué sirven: después de correr una migración en la nube, confirmar con la
-- base real que quedó como se esperaba, sin depender de la memoria. Las
-- consultas 1 a 7 se corrieron a mano el 2026-11-25 para cerrar las
-- migraciones 019 a 022.
--
-- Cómo usarlas en el SQL Editor de Supabase:
--   1. Abrí una consulta NUEVA (botón "+"; no uses /sql/new, que reabre el
--      último snippet guardado) y confirmá que la pestaña esté vacía.
--   2. Pegá UNA consulta por vez (el editor solo muestra el resultado de la
--      última sentencia) y ejecutala con Ctrl+Enter.
--   3. Comparalo con "ESPERADO". Si difiere, algo no se aplicó o se rompió.
--
-- La misma verificación contra la base LOCAL (Docker) la hace la suite:
-- `npm run test:sql` (permisosTablas.test.ts cubre la consulta 1).
--
-- Tip: la grilla de resultados es virtual y no muestra todo. Por eso varias
-- consultas devuelven pocas filas y agregadas.

-- ============================================================================
-- 1. Permisos sobre las 6 tablas (migraciones 017 y 022)
-- ============================================================================
-- ESPERADO: 2 filas.
--   authenticated | 24 | DELETE,INSERT,SELECT,UPDATE      (6 tablas x 4 privilegios)
--   service_role  | 42 | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
-- Si aparece una fila `anon`, o `authenticated` con REFERENCES/TRIGGER/TRUNCATE,
-- la 022 no se aplicó. Ojo: toda tabla NUEVA hereda otra vez todos los
-- privilegios por los default privileges de Supabase y necesita su propio revoke.
select grantee::text as rol, count(*) as n, string_agg(distinct privilege_type, ',' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('portafolios','operaciones','plazos_fijos','cuentas_saldos','movimientos_cuenta','preferencias_usuario')
  and grantee in ('anon','authenticated','service_role')
group by grantee
order by grantee;

-- ============================================================================
-- 2. RLS activo en todas las tablas de public (migraciones 002 y 007)
-- ============================================================================
-- ESPERADO: 6 filas, todas con rls_activo = true.
-- Una tabla con rls_activo = false queda abierta a cualquier usuario con grant.
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

-- ============================================================================
-- 3. Quién puede ejecutar cada función de public (migraciones 013 y 019)
-- ============================================================================
-- ESPERADO: 9 filas, todas security_definer = true.
--   authenticated_puede = true  : abrir_operacion, abrir_plazo_fijo,
--     cerrar_operacion, delete_own_account, liquidar_plazo_fijo,
--     registrar_movimiento_cuenta, set_saldo_inicial     (las 7 de la API)
--   authenticated_puede = false : assert_portafolio_propio, handle_new_user
--     (internas: solo las llaman otras funciones y el trigger de alta)
--   anon_puede = false en TODAS.
-- Las 7 "true" son las que el Security Advisor marca como advertencia; es el
-- diseño buscado (la app las llama con la sesión del usuario).
select p.proname as funcion,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_puede,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_puede
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

-- ============================================================================
-- 4. Funciones SECURITY DEFINER abiertas a anon o a PUBLIC (migración 019)
-- ============================================================================
-- ESPERADO: 0 filas.
-- Postgres le da EXECUTE a PUBLIC por defecto a toda función nueva; si una
-- función nueva aparece acá, falta su `revoke ... from public, anon`.
select p.proname as funcion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('public', p.oid, 'execute'));

-- ============================================================================
-- 5. Políticas RLS que llaman a auth.uid() sin envolver (migración 020)
-- ============================================================================
-- ESPERADO: 0 filas.
-- Una política con `auth.uid()` suelto se evalúa una vez POR FILA; con
-- `(select auth.uid())` una vez por consulta (optimización InitPlan). Esta
-- consulta lista las que quedaron sin envolver.
select tablename as tabla, policyname as politica
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'auth\.uid\(\)'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~* 'select auth\.uid\(\)'
order by tablename, policyname;

-- ============================================================================
-- 6. Cantidad de políticas por tabla (migraciones 002, 007 y 020)
-- ============================================================================
-- ESPERADO: 6 filas; la suma de `politicas` es 20. Si una tabla perdió una
-- política, queda sin esa operación (o abierta, según cómo se rompa).
select tablename as tabla, count(*) as politicas
from pg_policies
where schemaname = 'public'
group by tablename
order by tablename;

-- ============================================================================
-- 7. Claves foráneas sin índice que las cubra (migración 021)
-- ============================================================================
-- ESPERADO: 0 filas.
-- Reproduce la lógica del Performance Advisor (`unindexed_foreign_keys`): una
-- FK está cubierta si la primera columna de alguno de sus índices es la
-- primera columna de la FK. Una FK sin índice vuelve lentos los filtros por
-- portafolio_id y el `on delete cascade`.
select c.conrelid::regclass as tabla, c.conname as clave_foranea
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where c.contype = 'f'
  and n.nspname = 'public'
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
  )
order by 1, 2;

-- ============================================================================
-- 8. Triggers de usuario (migración 002)
-- ============================================================================
-- ESPERADO: 1 fila.
--   users (auth) | on_auth_user_created | habilitado = true
-- Es el trigger que crea el portafolio por defecto al registrarse un usuario.
-- Si falta o está deshabilitado, los usuarios nuevos entran sin portafolio y la
-- app queda vacía. (`tgenabled` es de tipo "char": hay que castearlo a text.)
select c.relnamespace::regnamespace::text as esquema,
       c.relname as tabla,
       t.tgname as trigger,
       (t.tgenabled::text <> 'D') as habilitado
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relnamespace::regnamespace::text in ('public', 'auth')
order by 1, 2, 3;
