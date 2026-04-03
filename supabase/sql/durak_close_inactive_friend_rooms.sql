-- Ручной запуск в Supabase SQL Editor (миграции 20260430120000 + 20260430130000).

CREATE INDEX IF NOT EXISTS idx_rooms_friend_waiting_playing
  ON public.rooms (id)
  WHERE COALESCE(matchmaking_pool, true) = false
    AND status = ANY (ARRAY['waiting'::text, 'playing'::text]);

CREATE OR REPLACE FUNCTION public.durak_close_inactive_friend_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  WITH stale AS (
    SELECT r.id
    FROM public.rooms r
    WHERE COALESCE(r.matchmaking_pool, true) = false
      AND r.status = ANY (ARRAY['waiting'::text, 'playing'::text])
      AND (
        CASE
          WHEN r.status = 'waiting' THEN GREATEST(
            r.created_at,
            COALESCE((SELECT MAX(rp.last_seen_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at),
            COALESCE((SELECT MAX(rp.joined_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at)
          )
          ELSE GREATEST(
            r.created_at,
            COALESCE((SELECT MAX(rs.updated_at) FROM public.room_state rs WHERE rs.room_id = r.id), r.created_at),
            COALESCE((SELECT MAX(rp.last_seen_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at),
            COALESCE((SELECT MAX(rp.joined_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at)
          )
        END
      ) < now() - interval '20 minutes'
  )
  UPDATE public.rooms u
  SET status = 'finished'
  FROM stale s
  WHERE u.id = s.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

ALTER FUNCTION public.durak_close_inactive_friend_rooms() SET row_security = off;
REVOKE ALL ON FUNCTION public.durak_close_inactive_friend_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.durak_close_inactive_friend_rooms() TO postgres;
GRANT EXECUTE ON FUNCTION public.durak_close_inactive_friend_rooms() TO service_role;
GRANT EXECUTE ON FUNCTION public.durak_close_inactive_friend_rooms() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.durak_player_ping(p_room_id uuid, p_player_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid text;
BEGIN
  v_pid := nullif(trim(coalesce(p_player_id, '')), '');
  IF v_pid IS NULL OR length(v_pid) < 1 OR length(v_pid) > 256 THEN
    RAISE EXCEPTION 'invalid player_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = p_room_id AND rp.player_id = v_pid
  ) THEN
    RAISE EXCEPTION 'not a room member';
  END IF;

  UPDATE public.room_players
  SET last_seen_at = now()
  WHERE room_id = p_room_id AND player_id = v_pid;

  IF EXISTS (
    SELECT 1 FROM public.rooms r
    WHERE r.id = p_room_id AND COALESCE(r.matchmaking_pool, true) = false
  ) THEN
    PERFORM public.durak_close_inactive_friend_rooms();
  END IF;
END;
$$;

ALTER FUNCTION public.durak_player_ping(uuid, text) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_player_ping(uuid, text) TO anon, authenticated, service_role;

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
  PERFORM public.durak_close_inactive_friend_rooms();
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
  PERFORM public.durak_close_inactive_friend_rooms();
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
  PERFORM public.durak_close_inactive_friend_rooms();
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
