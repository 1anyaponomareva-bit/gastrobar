-- Дурак: очередь, комнаты, состояние партии.
-- Применить в Supabase → SQL Editor или supabase db push.
--
-- Если таблицы rooms / room_players / room_state УЖЕ существуют и скрипт падает с
-- "relation rooms already exists" — НЕ создавай таблицы повторно; выполни только:
--   supabase/sql/durak_queue_functions_only.sql
-- После миграции: Database → Replication → включить `rooms`, `room_players`, `room_state` для Realtime.
-- Если таблицы уже есть с другими именами колонок — приведите схему к этой или поправьте RPC/клиент.

-- --- rooms ---
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players int NOT NULL DEFAULT 3 CHECK (max_players >= 2 AND max_players <= 5),
  search_deadline timestamptz NOT NULL,
  started_with_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_waiting_deadline
  ON public.rooms (status, search_deadline)
  WHERE status = 'waiting';

-- --- room_players ---
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

-- --- room_state: JSON партии (клиентский GameTable в state.game) ---
CREATE TABLE IF NOT EXISTS public.room_state (
  room_id uuid PRIMARY KEY REFERENCES public.rooms (id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- --- Финализация: 3 игрока сразу, или по таймауту 15 с (1 игрок + бот, или 2 игрока) ---
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
    INSERT INTO public.room_players (room_id, player_id, player_name, is_bot, seat_index)
    VALUES (p_room_id, bot_id, 'Бот', true, 1)
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

-- --- Войти в очередь: один аргумент jsonb — PostgREST/Supabase находит RPC без путаницы с порядком имён ---
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

-- Отключаем RLS внутри этих функций (надёжная вставка/обновление комнат из очереди).
ALTER FUNCTION public.durak_join_queue(jsonb) SET row_security = off;
ALTER FUNCTION public.durak_finalize_room_if_ready(uuid) SET row_security = off;

GRANT EXECUTE ON FUNCTION public.durak_join_queue(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.durak_finalize_room_if_ready(uuid) TO anon, authenticated, service_role;

-- RLS (чтение/запись для anon — ужесточите под auth.uid() при необходимости)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rooms_select_all ON public.rooms;
CREATE POLICY rooms_select_all ON public.rooms FOR SELECT USING (true);

-- INSERT нужен для RPC (иначе при некоторых настройках владельца/RLS вставка из функции падает).
DROP POLICY IF EXISTS rooms_insert_all ON public.rooms;
CREATE POLICY rooms_insert_all ON public.rooms FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS rooms_update_all ON public.rooms;
CREATE POLICY rooms_update_all ON public.rooms FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS room_players_select_all ON public.room_players;
CREATE POLICY room_players_select_all ON public.room_players FOR SELECT USING (true);

DROP POLICY IF EXISTS room_players_insert_all ON public.room_players;
CREATE POLICY room_players_insert_all ON public.room_players FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS room_state_all ON public.room_state;
CREATE POLICY room_state_all ON public.room_state FOR ALL USING (true) WITH CHECK (true);
