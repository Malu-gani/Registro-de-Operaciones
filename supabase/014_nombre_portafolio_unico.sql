-- Nombres de portafolio únicos por usuario (Cuenta → Tus Portafolios).
-- Correr en el SQL Editor de Supabase DESPUÉS de 013_borrar_cuenta.sql.
--
-- Antes no había ninguna restricción: se podían crear (o renombrar) dos
-- portafolios del mismo usuario con el mismo nombre. La comparación es
-- insensible a mayúsculas/minúsculas y a espacios al principio/final
-- (`lower(trim(nombre))`), para que "Cuenta" y " cuenta " también choquen.
--
-- Si esta migración falla con "could not create unique index", es porque ya
-- hay portafolios duplicados cargados: hay que renombrar uno de los dos manualmente
-- desde la app antes de volver a correrla.

create unique index if not exists portafolios_user_id_nombre_unico
  on portafolios (user_id, lower(trim(nombre)));
