-- Fase 1 (sistema de saldos): capital por cuenta y ledger de movimientos.
--
-- Cada portafolio tiene 4 "cuentas" (bolsillos), una por divisa/mercado:
--   ars           -> Pesos (CEDEARs + plazo fijo ARS)
--   usd           -> Dólares (Acciones USD + plazo fijo USD)
--   usdt_spot      -> USDT de Cripto Spot
--   usdt_futuros   -> USDT de Cripto Futuros (margen)  [billetera separada]
--
-- De cada cuenta se guarda el "Disponible" (Capital No Comprometido). El
-- "Comprometido" NO se guarda: se deriva en la app de las posiciones abiertas
-- (igual que hoy se deriva el balance de Futuros).
--
-- Correr en el SQL Editor de Supabase DESPUÉS de
-- 006_stop_loss_take_profit_opcionales.sql. Correr UNA sola vez (la migración
-- de datos del final duplicaría filas si se re-ejecuta).

-- ---------------------------------------------------------------------------
-- 1. Saldo disponible por cuenta
-- ---------------------------------------------------------------------------
create table if not exists cuentas_saldos (
  id uuid primary key default gen_random_uuid(),
  portafolio_id uuid not null references portafolios(id) on delete cascade,
  cuenta text not null check (cuenta in ('ars', 'usd', 'usdt_spot', 'usdt_futuros')),
  disponible numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (portafolio_id, cuenta)
);

alter table cuentas_saldos enable row level security;

create policy "usuarios ven sus saldos" on cuentas_saldos
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = cuentas_saldos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios crean sus saldos" on cuentas_saldos
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = cuentas_saldos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios actualizan sus saldos" on cuentas_saldos
  for update using (
    exists (
      select 1 from portafolios
      where portafolios.id = cuentas_saldos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Ledger unificado de movimientos de cuenta
--    (depósitos/retiros del usuario + auditoría de aperturas/cierres).
--    `monto` con signo: positivo entra al Disponible, negativo sale.
-- ---------------------------------------------------------------------------
create table if not exists movimientos_cuenta (
  id uuid primary key default gen_random_uuid(),
  portafolio_id uuid not null references portafolios(id) on delete cascade,
  cuenta text not null check (cuenta in ('ars', 'usd', 'usdt_spot', 'usdt_futuros')),
  tipo text not null check (tipo in (
    'deposito', 'retiro', 'ajuste_inicial',
    'apertura', 'cierre', 'plazo_apertura', 'plazo_liquidacion'
  )),
  monto numeric not null,
  fecha date not null,
  notas text,
  ref_operacion_id uuid,
  created_at timestamptz not null default now()
);

alter table movimientos_cuenta enable row level security;

create policy "usuarios ven sus movimientos de cuenta" on movimientos_cuenta
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = movimientos_cuenta.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios crean sus movimientos de cuenta" on movimientos_cuenta
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = movimientos_cuenta.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Migración de datos: los movimientos de Futuros existentes pasan al ledger
--    unificado como cuenta 'usdt_futuros'. La tabla movimientos_futuros queda
--    en desuso (no se borra en esta migración por seguridad).
-- ---------------------------------------------------------------------------
insert into movimientos_cuenta (portafolio_id, cuenta, tipo, monto, fecha, notas, created_at)
select
  portafolio_id,
  'usdt_futuros',
  case when monto >= 0 then 'deposito' else 'retiro' end,
  monto,
  fecha,
  notas,
  created_at
from movimientos_futuros;
