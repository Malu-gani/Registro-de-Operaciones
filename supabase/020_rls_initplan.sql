-- Envuelve `auth.uid()` en un subselect dentro de las políticas RLS
-- (advertencias `auth_rls_initplan` del Performance Advisor, 2026-10-29).
--
-- QUÉ PASABA: escrito como `auth.uid()` pelado, Postgres lo trata como una
-- expresión que depende de la fila y lo re-evalúa UNA VEZ POR FILA. Escrito
-- como `(select auth.uid())` lo reconoce como constante para toda la consulta,
-- lo evalúa una sola vez y cachea el resultado (InitPlan).
--
-- QUÉ NO CAMBIA: el resultado. `auth.uid()` devuelve lo mismo en todas las
-- filas de una consulta, porque sale del JWT de la sesión. Esto es puramente
-- cuánto cuesta calcularlo, no qué filas se ven. La semántica de seguridad
-- queda idéntica: mismas tablas, mismas condiciones, mismos dueños.
--
-- POR QUÉ IGUAL SE HACE: hoy no se nota —con pocas filas la diferencia es
-- invisible—, pero el costo crece lineal con el tamaño de la tabla, y
-- `operaciones` y `movimientos_cuenta` son las que más crecen con el uso. Es
-- barato arreglarlo ahora y caro descubrirlo con la tabla ya grande.
--
-- Las políticas se recrean una por una con su definición original intacta,
-- cambiando únicamente `auth.uid()` por `(select auth.uid())`.
--
-- Nota: `movimientos_futuros` tenía dos políticas con el mismo patrón, pero esa
-- tabla se eliminó en `009_drop_movimientos_futuros.sql`, así que no figura.

-- ---------------------------------------------------------------------------
-- portafolios (definidas en 002_auth_and_rls.sql)
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios ven sus propios portafolios" on portafolios;
create policy "usuarios ven sus propios portafolios" on portafolios
  for select using ((select auth.uid()) = user_id);

drop policy if exists "usuarios crean sus propios portafolios" on portafolios;
create policy "usuarios crean sus propios portafolios" on portafolios
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "usuarios actualizan sus propios portafolios" on portafolios;
create policy "usuarios actualizan sus propios portafolios" on portafolios
  for update using ((select auth.uid()) = user_id);

drop policy if exists "usuarios eliminan sus propios portafolios" on portafolios;
create policy "usuarios eliminan sus propios portafolios" on portafolios
  for delete using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- operaciones (definidas en 002_auth_and_rls.sql)
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios ven operaciones de sus portafolios" on operaciones;
create policy "usuarios ven operaciones de sus portafolios" on operaciones
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios crean operaciones en sus portafolios" on operaciones;
create policy "usuarios crean operaciones en sus portafolios" on operaciones
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios actualizan operaciones de sus portafolios" on operaciones;
create policy "usuarios actualizan operaciones de sus portafolios" on operaciones
  for update using (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios eliminan operaciones de sus portafolios" on operaciones;
create policy "usuarios eliminan operaciones de sus portafolios" on operaciones
  for delete using (
    exists (
      select 1 from portafolios
      where portafolios.id = operaciones.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- plazos_fijos (definidas en 003_tipos_activo_y_plazo_fijo.sql)
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios ven sus plazos fijos" on plazos_fijos;
create policy "usuarios ven sus plazos fijos" on plazos_fijos
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios crean sus plazos fijos" on plazos_fijos;
create policy "usuarios crean sus plazos fijos" on plazos_fijos
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios actualizan sus plazos fijos" on plazos_fijos;
create policy "usuarios actualizan sus plazos fijos" on plazos_fijos
  for update using (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios eliminan sus plazos fijos" on plazos_fijos;
create policy "usuarios eliminan sus plazos fijos" on plazos_fijos
  for delete using (
    exists (
      select 1 from portafolios
      where portafolios.id = plazos_fijos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- cuentas_saldos (definidas en 007_cuentas_y_movimientos.sql)
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios ven sus saldos" on cuentas_saldos;
create policy "usuarios ven sus saldos" on cuentas_saldos
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = cuentas_saldos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios crean sus saldos" on cuentas_saldos;
create policy "usuarios crean sus saldos" on cuentas_saldos
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = cuentas_saldos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios actualizan sus saldos" on cuentas_saldos;
create policy "usuarios actualizan sus saldos" on cuentas_saldos
  for update using (
    exists (
      select 1 from portafolios
      where portafolios.id = cuentas_saldos.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- movimientos_cuenta (definidas en 007_cuentas_y_movimientos.sql)
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios ven sus movimientos de cuenta" on movimientos_cuenta;
create policy "usuarios ven sus movimientos de cuenta" on movimientos_cuenta
  for select using (
    exists (
      select 1 from portafolios
      where portafolios.id = movimientos_cuenta.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

drop policy if exists "usuarios crean sus movimientos de cuenta" on movimientos_cuenta;
create policy "usuarios crean sus movimientos de cuenta" on movimientos_cuenta
  for insert with check (
    exists (
      select 1 from portafolios
      where portafolios.id = movimientos_cuenta.portafolio_id
      and portafolios.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- preferencias_usuario (definidas en 012_preferencias_usuario.sql)
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios ven sus preferencias" on preferencias_usuario;
create policy "usuarios ven sus preferencias" on preferencias_usuario
  for select using ((select auth.uid()) = user_id);

drop policy if exists "usuarios crean sus preferencias" on preferencias_usuario;
create policy "usuarios crean sus preferencias" on preferencias_usuario
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "usuarios actualizan sus preferencias" on preferencias_usuario;
create policy "usuarios actualizan sus preferencias" on preferencias_usuario
  for update using ((select auth.uid()) = user_id);
