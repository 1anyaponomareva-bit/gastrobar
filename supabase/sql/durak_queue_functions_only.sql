-- ============================================================================
-- Дурак: только RPC и RLS — БЕЗ CREATE TABLE
-- Запускай в Supabase → SQL Editor, если таблицы rooms / room_players / room_state УЖЕ есть
-- и полная миграция падает с "relation rooms already exists".
-- Если схема room_players старая — см. durak_room_players_column_player_name.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.durak_join_queue(text, text);

CREATE OR REPLACE FUNCTION public.durak_finalize_room_if_ready(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rooms%ROWTYPE;
  cnt int;
  bot_id text;
  bot_names text[] := ARRAY[
    'Алексей', 'Марина', 'Дмитрий', 'Ольга', 'Иван', 'Елена', 'Сергей', 'Анна',
    'Павел', 'Катя', 'Миша', 'Саша', 'Никита', 'Даша'
  ];
  bot_label text;
  n int;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'waiting' THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO cnt FROM public.room_players WHERE room_id = p_room_id;

  IF cnt >= 3 THEN
    UPDATE public.rooms SET status = 'playing' WHERE id = p_room_id;
    RETURN;
  END IF;

  IF r.search_deadline >= now() THEN
    RETURN;
  END IF;

  IF cnt <= 0 THEN
    RETURN;
  END IF;

  IF cnt = 1 THEN
    bot_id := 'bot-' || p_room_id::text;
    n := array_length(bot_names, 1);
    bot_label := bot_names[1 + floor(random() * n)::int];
    INSERT INTO public.room_players (room_id, player_id, player_name, is_bot, seat_index)
    VALUES (p_room_id, bot_id, bot_label, true, 1)
    ON CONFLICT (room_id, player_id) DO NOTHING;
    UPDATE public.rooms
    SET status = 'playing', started_with_bot = true
    WHERE id = p_room_id;
    RETURN;
  END IF;

  IF cnt = 2 THEN
    UPDATE public.rooms SET status = 'playing' WHERE id = p_room_id;
    RETURN;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.durak_join_queue(payload jsonb)
RETURNS TABLE (out_room_id uuid, out_search_deadline timestamptz, out_rejoined boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
  room_rec public.rooms%ROWTYPE;
  seat int;
  v_player_id text;
  v_display_name text;
BEGIN
  v_player_id := nullif(trim(coalesce(payload->>'player_id', '')), '');
  v_display_name := coalesce(nullif(trim(coalesce(payload->>'display_name', '')), ''), 'Игрок');

  IF v_player_id IS NULL OR length(v_player_id) = 0 THEN
    RAISE EXCEPTION 'player_id required';
  END IF;

  SELECT rp.room_id INTO rid
  FROM public.room_players rp
  INNER JOIN public.rooms rm ON rm.id = rp.room_id
  WHERE rp.player_id = v_player_id
    AND rm.status = 'waiting'
  LIMIT 1;

  IF rid IS NOT NULL THEN
    SELECT rm.search_deadline INTO out_search_deadline FROM public.rooms rm WHERE rm.id = rid;
    out_room_id := rid;
    out_rejoined := true;
    PERFORM public.durak_finalize_room_if_ready(rid);
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT rm.* INTO room_rec
  FROM public.rooms rm
  WHERE rm.status = 'waiting'
    AND rm.search_deadline > now()
    AND (
      SELECT count(*)::int FROM public.room_players rp WHERE rp.room_id = rm.id
    ) < rm.max_players
  ORDER BY rm.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF FOUND THEN
    SELECT count(*)::int INTO seat FROM public.room_players WHERE room_id = room_rec.id;
    INSERT INTO public.room_players (room_id, player_id, player_name, is_bot, seat_index)
    VALUES (room_rec.id, v_player_id, v_display_name, false, seat);
    PERFORM public.durak_finalize_room_if_ready(room_rec.id);
    out_room_id := room_rec.id;
    out_search_deadline := room_rec.search_deadline;
    out_rejoined := false;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.rooms (status, max_players, search_deadline, started_with_bot)
  VALUES ('waiting', 3, now() + interval '15 seconds', false)
  RETURNING * INTO room_rec;

  INSERT INTO public.room_players (room_id, player_id, player_name, is_bot, seat_index)
  VALUES (room_rec.id, v_player_id, v_display_name, false, 0);

  PERFORM public.durak_finalize_room_if_ready(room_rec.id);

  out_room_id := room_rec.id;
  out_search_deadline := room_rec.search_deadline;
  out_rejoined := false;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.durak_join_queue(jsonb) SET row_security = off;
ALTER FUNCTION public.durak_finalize_room_if_ready(uuid) SET row_security = off;

GRANT EXECUTE ON FUNCTION public.durak_join_queue(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.durak_finalize_room_if_ready(uuid) TO anon, authenticated, service_role;

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
