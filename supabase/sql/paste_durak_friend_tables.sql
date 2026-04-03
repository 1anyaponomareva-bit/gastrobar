-- Выполнить целиком в Supabase → SQL Editor (или supabase db push).
-- Копия миграции 20260403120000_durak_friend_tables.sql.

-- Друзья: пользовательские столы, отдельно от быстрой очереди (matchmaking_pool).
-- Быстрая игра только в комнатах с matchmaking_pool = true.

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS matchmaking_pool boolean NOT NULL DEFAULT true;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS table_name text;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS owner_player_id text;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS join_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_join_code_unique
  ON public.rooms (join_code)
  WHERE join_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_friend_waiting_public
  ON public.rooms (status, is_public, matchmaking_pool)
  WHERE status = 'waiting';

COMMENT ON COLUMN public.rooms.matchmaking_pool IS 'true = быстрая очередь; false = стол с друзьями';
COMMENT ON COLUMN public.rooms.join_code IS 'Короткий код приглашения (столы с друзьями)';

-- Финализация: быстрая очередь — при 2 игроках старт сразу; один — бот после дедлайна; стол с друзьями — только max_players.
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

  IF NOT COALESCE(r.matchmaking_pool, true) THEN
    IF cnt >= r.max_players THEN
      UPDATE public.rooms SET status = 'playing' WHERE id = p_room_id;
    END IF;
    RETURN;
  END IF;

  IF cnt >= r.max_players THEN
    UPDATE public.rooms SET status = 'playing' WHERE id = p_room_id;
    RETURN;
  END IF;

  IF cnt >= 2 THEN
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
    AND COALESCE(rm.matchmaking_pool, true) = true
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

  INSERT INTO public.rooms (status, max_players, search_deadline, started_with_bot, matchmaking_pool)
  VALUES ('waiting', 3, now() + interval '40 seconds', false, true)
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

-- Создать стол с друзьями (создатель в первом месте).
-- PostgREST вернёт одну строку как JSON-объект с полями out_*.
CREATE OR REPLACE FUNCTION public.durak_create_friend_room(payload jsonb)
RETURNS TABLE (out_room_id uuid, out_join_code text, out_table_name text, out_max_players int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id text;
  v_display_name text;
  v_table_name text;
  v_max int;
  rid uuid;
  code text;
  attempts int := 0;
BEGIN
  v_player_id := nullif(trim(coalesce(payload->>'player_id', '')), '');
  v_display_name := coalesce(nullif(trim(coalesce(payload->>'display_name', '')), ''), 'Игрок');
  v_table_name := coalesce(nullif(trim(coalesce(payload->>'table_name', '')), ''), 'Стол');
  v_max := coalesce((payload->>'max_players')::int, 4);
  IF v_player_id IS NULL OR length(v_player_id) = 0 THEN
    RAISE EXCEPTION 'player_id required';
  END IF;
  IF v_max < 2 OR v_max > 5 THEN
    RAISE EXCEPTION 'max_players must be 2..5';
  END IF;

  LOOP
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    attempts := attempts + 1;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.join_code = code);
    IF attempts >= 20 THEN
      RAISE EXCEPTION 'join_code collision';
    END IF;
  END LOOP;

  INSERT INTO public.rooms (
    status, max_players, search_deadline, started_with_bot,
    matchmaking_pool, table_name, owner_player_id, is_public, join_code
  )
  VALUES (
    'waiting', v_max, now() + interval '24 hours', false,
    false, v_table_name, v_player_id, true, code
  )
  RETURNING id INTO rid;

  INSERT INTO public.room_players (room_id, player_id, player_name, is_bot, seat_index)
  VALUES (rid, v_player_id, v_display_name, false, 0);

  PERFORM public.durak_finalize_room_if_ready(rid);

  out_room_id := rid;
  out_join_code := code;
  out_table_name := v_table_name;
  out_max_players := v_max;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.durak_create_friend_room(jsonb) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_create_friend_room(jsonb) TO anon, authenticated, service_role;

-- Присоединиться к столу по room_id или join_code.
CREATE OR REPLACE FUNCTION public.durak_join_friend_room(payload jsonb)
RETURNS TABLE (out_room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_player_id text;
  v_display_name text;
  rid uuid;
  seat int;
  v_join text;
  v_room_text text;
BEGIN
  v_player_id := nullif(trim(coalesce(payload->>'player_id', '')), '');
  v_display_name := coalesce(nullif(trim(coalesce(payload->>'display_name', '')), ''), 'Игрок');
  v_join := upper(nullif(trim(coalesce(payload->>'join_code', '')), ''));

  IF v_player_id IS NULL OR length(v_player_id) = 0 THEN
    RAISE EXCEPTION 'player_id required';
  END IF;

  IF v_join IS NOT NULL AND length(v_join) > 0 THEN
    SELECT r.id INTO rid FROM public.rooms r
    WHERE r.join_code = v_join AND r.status = 'waiting' AND COALESCE(r.matchmaking_pool, true) = false
    LIMIT 1;
  ELSE
    v_room_text := nullif(trim(coalesce(payload->>'room_id', '')), '');
    IF v_room_text IS NOT NULL THEN
      BEGIN
        rid := v_room_text::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        rid := NULL;
      END;
    END IF;
    IF rid IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = rid AND r.status = 'waiting' AND COALESCE(r.matchmaking_pool, true) = false
    ) THEN
      rid := NULL;
    END IF;
  END IF;

  IF rid IS NULL THEN
    RAISE EXCEPTION 'table not found or not accepting players';
  END IF;

  IF EXISTS (SELECT 1 FROM public.room_players rp WHERE rp.room_id = rid AND rp.player_id = v_player_id) THEN
    PERFORM public.durak_finalize_room_if_ready(rid);
    out_room_id := rid;
    RETURN NEXT;
    RETURN;
  END IF;

  IF (SELECT count(*)::int FROM public.room_players WHERE room_id = rid) >=
     (SELECT max_players FROM public.rooms WHERE id = rid) THEN
    RAISE EXCEPTION 'table is full';
  END IF;

  SELECT count(*)::int INTO seat FROM public.room_players WHERE room_id = rid;
  INSERT INTO public.room_players (room_id, player_id, player_name, is_bot, seat_index)
  VALUES (rid, v_player_id, v_display_name, false, seat);

  PERFORM public.durak_finalize_room_if_ready(rid);

  out_room_id := rid;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.durak_join_friend_room(jsonb) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_join_friend_room(jsonb) TO anon, authenticated, service_role;

-- Ранний старт создателем (от 2 игроков, если стол ещё не полный).
CREATE OR REPLACE FUNCTION public.durak_start_friend_room(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
  v_player_id text;
  cnt int;
  owner_id text;
BEGIN
  v_player_id := nullif(trim(coalesce(payload->>'player_id', '')), '');
  rid := nullif(trim(coalesce(payload->>'room_id', '')), '')::uuid;
  IF v_player_id IS NULL OR rid IS NULL THEN
    RAISE EXCEPTION 'room_id and player_id required';
  END IF;

  SELECT r.owner_player_id INTO owner_id FROM public.rooms r WHERE r.id = rid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF owner_id IS NULL OR owner_id <> v_player_id THEN
    RAISE EXCEPTION 'only host can start';
  END IF;

  SELECT count(*)::int INTO cnt FROM public.room_players WHERE room_id = rid;
  IF cnt < 2 THEN
    RAISE EXCEPTION 'need at least 2 players';
  END IF;

  UPDATE public.rooms SET status = 'playing' WHERE id = rid AND status = 'waiting';
END;
$$;

ALTER FUNCTION public.durak_start_friend_room(jsonb) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_start_friend_room(jsonb) TO anon, authenticated, service_role;

ALTER FUNCTION public.durak_finalize_room_if_ready(uuid) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_finalize_room_if_ready(uuid) TO anon, authenticated, service_role;

-- Быстрая очередь: финализация при втором INSERT в room_players (не зависит от RPC/окна браузера).
CREATE OR REPLACE FUNCTION public.durak_room_players_after_insert_finalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.durak_finalize_room_if_ready(NEW.room_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_players_after_insert_finalize ON public.room_players;
CREATE TRIGGER trg_room_players_after_insert_finalize
  AFTER INSERT ON public.room_players
  FOR EACH ROW
  EXECUTE PROCEDURE public.durak_room_players_after_insert_finalize();

ALTER FUNCTION public.durak_room_players_after_insert_finalize() SET row_security = off;
