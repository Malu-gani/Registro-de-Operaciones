-- Índices sobre las claves foráneas que no tenían uno (sugerencias
-- `unindexed_foreign_keys` del Performance Advisor, 2026-10-30).
--
-- QUÉ PASABA: Postgres crea un índice solo para la clave primaria y para los
-- `unique`. Una clave foránea NO lo recibe. Hasta ahora el repo no tenía ni un
-- `create index` en ninguna migración, así que `operaciones`, `plazos_fijos` y
-- `movimientos_cuenta` sólo se podían recorrer enteras al filtrar por
-- `portafolio_id` — que es como las filtra absolutamente todo: las políticas
-- RLS, las RPC y las pantallas de la app.
--
-- POR QUÉ IMPORTA ACÁ MÁS QUE EN OTRO LADO: son justo las tres tablas que
-- crecen con el uso. Las otras no: `portafolios` tiene un puñado de filas,
-- `cuentas_saldos` tiene como mucho 4 por portafolio y `preferencias_usuario`
-- una por usuario. Un scan completo sobre una tabla chica es gratis; sobre el
-- historial de operaciones de varios años, no.
--
-- EL OTRO EFECTO, EL QUE NO SE VE: `on delete cascade`. Al borrar un portafolio
-- —o una cuenta entera, vía `delete_own_account()`— Postgres tiene que buscar
-- las filas hijas de cada tabla referenciante. Sin índice eso es un scan
-- completo por tabla y por fila borrada.
--
-- `cuentas_saldos` también tiene la FK y NO figura acá: su `unique
-- (portafolio_id, cuenta)` ya crea un índice que arranca con `portafolio_id`,
-- y eso alcanza para cubrirla. Por eso el Advisor la deja afuera.
--
-- Se indexa sólo la columna de la FK, que es exactamente lo que el Advisor
-- pide. Índices compuestos (por ejemplo `(portafolio_id, fecha)` para ordenar
-- el historial) serían otra discusión, con otra evidencia: medir primero qué
-- consulta duele. Un índice no es gratis, lo paga cada insert.
--
-- `if not exists` para que la migración se pueda correr dos veces sin romper,
-- igual que el resto del repo.

create index if not exists idx_operaciones_portafolio_id
  on operaciones (portafolio_id);

create index if not exists idx_plazos_fijos_portafolio_id
  on plazos_fijos (portafolio_id);

create index if not exists idx_movimientos_cuenta_portafolio_id
  on movimientos_cuenta (portafolio_id);
