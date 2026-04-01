-- Дополнение, если первая миграция уже применена без INSERT на rooms / row_security.
-- Без этого RPC durak_join_queue может падать с ошибкой прав при вставке комнаты.

DROP POLICY IF EXISTS rooms_insert_all ON public.rooms;
CREATE POLICY rooms_insert_all ON public.rooms FOR INSERT WITH CHECK (true);

ALTER FUNCTION public.durak_join_queue(text, text) SET row_security = off;
ALTER FUNCTION public.durak_finalize_room_if_ready(uuid) SET row_security = off;
