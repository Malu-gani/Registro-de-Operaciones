-- Fase 3: tipos de activo (acciones/crypto), CEDEARs, apalancamiento y plazos fijos.
-- Correr en el SQL Editor de Supabase DESPUÉS de 002_auth_and_rls.sql.
--
-- No borra ni trunca datos existentes. Las operaciones ya cargadas (todas
-- crypto en USDT hasta ahora) quedan clasificadas como tipo_activo='crypto',
-- divisa='USDT' por los valores por defecto.

alter table operaciones
  add column if not exists tipo_activo text not null default 'crypto'
    check (tipo_activo in ('acciones', 'crypto')),
  add column if not exists sub_tipo_activo text
    check (sub_tipo_activo in ('cedear', 'usd')),
  add column if not exists divisa text not null default 'USDT'
    check (divisa in ('USD', 'ARS', 'USDT')),
  add column if not exists apalancamiento numeric;

-- sub_tipo_activo solo tiene sentido para acciones; apalancamiento solo para crypto.
alter table operaciones
  add constraint sub_tipo_solo_acciones
    check (tipo_activo = 'acciones' or sub_tipo_activo is null),
  add constraint apalancamiento_solo_crypto
    check (tipo_activo = 'crypto' or apalancamiento is null);

-- Plazos fijos: registro separado de las operaciones (no tiene stop loss ni
-- take profit, no entra en el cálculo de win rate / R:R del dashboard).
create table if not exists plazos_fijos (
  id uuid primary key default gen_random_uuid(),
  portafolio_id uuid not null references portafolios(id) on delete cascade,
  monto numeric not null check (monto > 0),
  divisa text not null check (divisa in ('USD', 'ARS')),
  tasa_tna numeric not null check (tasa_tna >= 0),
  plazo_dias integer not null check (plazo_dias > 0),
  fecha_inicio date not null,
  fecha_vencimiento date not null,
  interes_estimado numeric not null,
  notas text,
  created_at timestamptz not null default now()
);

alter table plazos_fijos enable row level security;

create policy "usuarios ven sus plazos fijos" on plazos_fijos
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios crean sus plazos fijos" on plazos_fijos
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios actualizan sus plazos fijos" on plazos_fijos
  for update using (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios eliminan sus plazos fijos" on plazos_fijos
  for delete using (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );
