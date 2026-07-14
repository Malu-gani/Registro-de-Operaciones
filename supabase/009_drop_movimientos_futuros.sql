-- Borra el ledger legado de la cuenta de Futuros. Sus filas ya fueron
-- migradas una sola vez a `movimientos_cuenta` (cuenta `usdt_futuros`) en
-- 007_cuentas_y_movimientos.sql, y desde el 2026-07-14 ninguna pantalla la
-- lee ni la escribe (ver docs/architecture.md sección 2). Correr en:
-- Supabase Dashboard > SQL Editor > New query > Run.

drop table if exists movimientos_futuros;
