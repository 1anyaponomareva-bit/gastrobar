-- RLS для дурака (если основной скрипт функций уже выполнен, а политики — отдельно).
-- Запускай целиком одним запросом в SQL Editor.

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_select_all ON public.rooms;
CREATE POLICY rooms_select_all ON public.rooms
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS rooms_insert_all ON public.rooms;
CREATE POLICY rooms_insert_all ON public.rooms
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS rooms_update_all ON public.rooms;
CREATE POLICY rooms_update_all ON public.rooms
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS room_players_select_all ON public.room_players;
CREATE POLICY room_players_select_all ON public.room_players
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS room_players_insert_all ON public.room_players;
CREATE POLICY room_players_insert_all ON public.room_players
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS room_state_all ON public.room_state;
CREATE POLICY room_state_all ON public.room_state
  FOR ALL
  USING (true)
  WITH CHECK (true);
