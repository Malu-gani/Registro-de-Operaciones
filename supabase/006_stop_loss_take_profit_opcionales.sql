-- Stop Loss y Take Profit pasan a ser opcionales al cargar una operación
-- (antes eran obligatorios). Como el ratio riesgo/beneficio y el % de
-- riesgo se derivan de esos dos precios, tampoco se pueden calcular
-- siempre y también pasan a ser opcionales.
-- Correr en: Supabase Dashboard > SQL Editor > New query > Run.

alter table operaciones alter column precio_stop_loss drop not null;
alter table operaciones alter column precio_take_profit drop not null;
alter table operaciones alter column ratio_riesgo_beneficio drop not null;
alter table operaciones alter column porcentaje_riesgo_cuenta drop not null;
