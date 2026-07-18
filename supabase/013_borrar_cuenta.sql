-- Borrado de cuenta autogestionado (pestaña Ajustes → zona peligrosa).
-- Correr en el SQL Editor de Supabase DESPUÉS de 012_preferencias_usuario.sql.
-- Es idempotente (create or replace + grants explícitos), se puede re-ejecutar.
--
-- Por qué una función y no borrar desde el cliente: la anon key del navegador
-- NO tiene permiso para borrar filas de auth.users (es la tabla de usuarios de
-- Supabase Auth). Esta función corre con `security definer`, es decir con los
-- privilegios de su dueño (postgres), así que sí puede borrar el usuario.
--
-- Seguridad: la función NO recibe ningún id como parámetro. Siempre borra a
-- `auth.uid()`, el usuario de la sesión que la invoca. Un usuario logueado solo
-- puede borrarse a sí mismo, nunca a otro. Si no hay sesión, `auth.uid()` es
-- NULL y no borra nada.
--
-- El resto de los datos del usuario (portafolios, operaciones, cuentas,
-- movimientos, preferencias) se elimina solo por los `on delete cascade` que
-- cuelgan de auth.users. No hay que borrar tabla por tabla.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No hay una sesión activa.';
  end if;

  delete from auth.users where id = uid;
end;
$$;

-- Solo usuarios autenticados pueden invocarla (no el rol anónimo).
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
