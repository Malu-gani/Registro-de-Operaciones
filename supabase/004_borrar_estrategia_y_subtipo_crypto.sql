-- Fase 4: se saca el campo "estrategia" del formulario de carga (el campo
-- de notas ya cubre ese caso de uso) y se permite sub_tipo_activo también
-- para operaciones crypto (spot/futuros), no solo para acciones
-- (cedear/usd) como hasta ahora.
-- Correr en el SQL Editor de Supabase DESPUÉS de 003_tipos_activo_y_plazo_fijo.sql.

alter table operaciones drop column if exists estrategia;

-- Las filas crypto cargadas antes de este cambio quedan con
-- sub_tipo_activo = null (siguen siendo válidas, no se tocan).
alter table operaciones drop constraint if exists operaciones_sub_tipo_activo_check;
alter table operaciones drop constraint if exists sub_tipo_solo_acciones;

alter table operaciones
  add constraint sub_tipo_activo_valido check (
    sub_tipo_activo is null
    or (tipo_activo = 'acciones' and sub_tipo_activo in ('cedear', 'usd'))
    or (tipo_activo = 'crypto' and sub_tipo_activo in ('spot', 'futuros'))
  );
