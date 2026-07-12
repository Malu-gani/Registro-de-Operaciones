-- Esquema inicial: portafolios + operaciones.
-- Correr completo en: Supabase Dashboard > SQL Editor > New query > Run.
--
-- Este script solo crea las tablas base y activa RLS sin políticas
-- (= sin auth.uid() nadie puede leer/escribir todavía). Las políticas
-- reales por usuario, la relación con auth.users y la creación automática
-- de portafolios están en supabase/002_auth_and_rls.sql — correlo justo
-- después de este.

create extension if not exists "pgcrypto";

create table if not exists portafolios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo_mercado text not null check (tipo_mercado in ('cripto', 'acciones', 'mixto')),
  capital_inicial numeric not null default 0,
  capital_actual numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists operaciones (
  id uuid primary key default gen_random_uuid(),
  portafolio_id uuid not null references portafolios(id) on delete cascade,
  activo text not null,
  tipo_operacion text not null check (tipo_operacion in ('long', 'short')),
  fecha_entrada date not null,
  precio_entrada numeric not null,
  precio_stop_loss numeric not null,
  precio_take_profit numeric not null,
  cantidad numeric not null,
  fecha_salida date,
  precio_salida numeric,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  resultado_pnl numeric,
  ratio_riesgo_beneficio numeric not null,
  porcentaje_riesgo_cuenta numeric not null,
  estrategia text,
  notas text,
  created_at timestamptz not null default now()
);

alter table portafolios enable row level security;
alter table operaciones enable row level security;
