-- ============================================================================
-- Дурак: СХЕМА + RPC + RLS
-- Выполни в Supabase → SQL Editor ОДНИМ запуском СВЕРХУ ВНИЗ.
--
-- durak_finalize_room_if_ready: RETURNS void — это нормально: PostgREST отдаёт 204
-- без тела. Прокси /supabase-proxy обязан отдавать 204 без body (иначе падает Node).
-- durak_join_queue: RETURNS TABLE — тело JSON (массив строк).
-- Если был HTTP 500: чаще всего таблицы старые — нет колонки started_with_bot
-- или room_players без player_name. Блок «СХЕМА» ниже это чинит.
-- ============================================================================

-- --- СХЕМА: таблицы и недостающие колонки (без этого INSERT в RPC падает с 500) ---

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players int NOT NULL DEFAULT 3 CHECK (max_players >= 2 AND max_players <= 5),
  search_deadline timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  started_with_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms (id) ON DELETE CASCADE,
  player_id text NOT NULL,
  player_name text NOT NULL DEFAULT '',
  is_bot boolean NOT NULL DEFAULT false,
  seat_index int NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_room ON public.room_players (room_id);
CREATE INDEX IF NOT EXISTS idx_rooms_waiting_deadline
  ON public.rooms (status, search_deadline)
  WHERE status = 'waiting';

CREATE TABLE IF NOT EXISTS public.room_state (
  room_id uuid PRIMARY KEY REFERENCES public.rooms (id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Если таблицы уже были, но без колонок под новый RPC:
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS started_with_bot boolean NOT NULL DEFAULT false;
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS search_deadline timestamptz;
UPDATE public.rooms SET search_deadline = now() + interval '1 hour' WHERE search_deadline IS NULL;
ALTER TABLE public.rooms ALTER COLUMN search_deadline SET NOT NULL;
ALTER TABLE public.rooms ALTER COLUMN search_deadline SET DEFAULT (now() + interval '1 hour');

ALTER TABLE public.room_players ADD COLUMN IF NOT EXISTS player_name text NOT NULL DEFAULT '';
ALTER TABLE public.room_players ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;
ALTER TABLE public.room_players ADD COLUMN IF NOT EXISTS seat_index int NOT NULL DEFAULT 0;
ALTER TABLE public.room_players ADD COLUMN IF NOT EXISTS joined_at timestamptz NOT NULL DEFAULT now();

-- Права на таблицы (на случай кастомных ролей)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_players TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_state TO anon, authenticated, service_role;

-- Без USAGE на схему public роль anon не видит RPC → часто HTTP 500 с пустым телом.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ============================================================================
-- RPC: сначала убрать все перегрузки (иначе PostgREST может выбрать не ту функцию → 500).
-- ============================================================================

DROP FUNCTION IF EXISTS public.durak_join_queue(text, text);
DROP FUNCTION IF EXISTS public.durak_join_queue(jsonb);
DROP FUNCTION IF EXISTS public.durak_finalize_room_if_ready(uuid);

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
