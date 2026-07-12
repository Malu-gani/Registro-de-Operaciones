-- Fase 2: autenticación real de usuarios.
-- Correr en el SQL Editor de Supabase DESPUÉS de haber corrido schema.sql.
--
-- Reemplaza el modelo "single-user dev" (portafolio compartido, políticas
-- permisivas) por operaciones/portafolios ligados a auth.users, con RLS
-- estricta por usuario.

-- Los datos de prueba del modelo anterior no tienen dueño real; los
-- limpiamos antes de exigir user_id NOT NULL. Deben truncarse juntas en
-- la misma sentencia por la FK entre ambas tablas.
truncate table operaciones, portafolios;

-- Cada portafolio pertenece a un usuario autenticado.
alter table portafolios
  add column if not exists user_id uuid not null references auth.users(id) on delete cascade;

-- Al crear un usuario nuevo, se le crea automáticamente su portafolio por defecto.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.portafolios (user_id, nombre, tipo_mercado, capital_inicial, capital_actual)
  values (new.id, 'Mi Cuenta Principal', 'mixto', 10000, 10000);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Reemplazamos las políticas permisivas de desarrollo por políticas reales.
drop policy if exists "dev: allow all on portafolios" on portafolios;
drop policy if exists "dev: allow all on operaciones" on operaciones;

create policy "usuarios ven sus propios portafolios" on portafolios
  for select using (auth.uid() = user_id);

create policy "usuarios crean sus propios portafolios" on portafolios
  for insert with check (auth.uid() = user_id);

create policy "usuarios actualizan sus propios portafolios" on portafolios
  for update using (auth.uid() = user_id);

create policy "usuarios eliminan sus propios portafolios" on portafolios
  for delete using (auth.uid() = user_id);

create policy "usuarios ven operaciones de sus portafolios" on operaciones
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios crean operaciones en sus portafolios" on operaciones
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios actualizan operaciones de sus portafolios" on operaciones
  for update using (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );

create policy "usuarios eliminan operaciones de sus portafolios" on operaciones
  for delete using (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = auth.uid()
    )
  );
