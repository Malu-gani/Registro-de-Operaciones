-- Preferencias de usuario (pestaña Ajustes): tema de la interfaz y umbrales
-- personalizados del semáforo de riesgo. Una fila por usuario (la PK es el
-- user_id), ligada a auth.users con RLS estricta.
--
-- Correr en el SQL Editor de Supabase DESPUÉS de
-- 011_no_fecha_futura_operacion.sql. Es idempotente (create if not exists +
-- drop policy if exists antes de cada create), se puede re-ejecutar sin romper.
--
-- Notas de diseño:
--   * `tema`: 'auto' respeta el tema del sistema operativo (comportamiento
--     actual); 'claro'/'oscuro' lo fuerzan.
--   * `umbrales_riesgo`: JSON opcional con los cortes del semáforo por clase de
--     activo. Si es NULL, la app usa los valores por defecto de
--     `riskCalculations.ts` (UMBRALES_RIESGO_DEFAULT). No se validan acá: la
--     app garantiza la forma { acciones|cripto_spot|futuros: {bajo,medio,alto} }.
--   * La fila NO se crea con el usuario: se hace upsert la primera vez que el
--     usuario guarda una preferencia. Sin fila => defaults.

create table if not exists preferencias_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tema text not null default 'auto' check (tema in ('auto', 'claro', 'oscuro')),
  umbrales_riesgo jsonb,
  updated_at timestamptz not null default now()
);

alter table preferencias_usuario enable row level security;

drop policy if exists "usuarios ven sus preferencias" on preferencias_usuario;
create policy "usuarios ven sus preferencias" on preferencias_usuario
  for select using (auth.uid() = user_id);

drop policy if exists "usuarios crean sus preferencias" on preferencias_usuario;
create policy "usuarios crean sus preferencias" on preferencias_usuario
  for insert with check (auth.uid() = user_id);

drop policy if exists "usuarios actualizan sus preferencias" on preferencias_usuario;
create policy "usuarios actualizan sus preferencias" on preferencias_usuario
  for update using (auth.uid() = user_id);
