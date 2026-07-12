-- Fase 5: cuenta de Futuros del portafolio. Ledger de movimientos
-- manuales (depósitos/retiros de dinero real, no P&L) — el balance de
-- Futuros se calcula en la aplicación como la suma de estos movimientos
-- más la suma del resultado_pnl de las operaciones crypto futuros ya
-- cerradas (esas ya viven en la tabla operaciones, no se duplican acá).
-- Correr en el SQL Editor de Supabase DESPUÉS de
-- 004_borrar_estrategia_y_subtipo_crypto.sql.

create table if not exists movimientos_futuros (
  id uuid primary key default gen_random_uuid(),
  portafolio_id uuid not null references portafolios(id) on delete cascade,
  monto numeric not null check (monto <> 0),
  fecha date not null,
  notas text,
  created_at timestamptz not null default now()
);

alter table movimientos_futuros enable row level security;

create policy "usuarios ven sus movimientos de futuros" on movimientos_futuros
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = movimientos_futuros.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios crean sus movimientos de futuros" on movimientos_futuros
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = movimientos_futuros.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );
