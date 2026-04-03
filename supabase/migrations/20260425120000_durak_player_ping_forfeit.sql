-- Пинг активности и техническая победа, если соперник не пинговал >20 с (на сервере).

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

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
END;
$$;

ALTER FUNCTION public.durak_player_ping(uuid, text) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_player_ping(uuid, text) TO anon, authenticated, service_role;

-- Победа по отсутствию соперника: все прочие люди не пинговали 20+ с, вы — пинговали недавно, партия ещё playing.
CREATE OR REPLACE FUNCTION public.durak_forfeit_stale_opponent(p_room_id uuid, p_player_id text)
RETURNS TABLE (out_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid text;
  v_room_st text;
  v_me_seen timestamptz;
  v_game_st text;
  v_opp_id text;
  v_state jsonb;
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

  SELECT r.status::text INTO v_room_st FROM public.rooms r WHERE r.id = p_room_id;
  IF v_room_st IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF v_room_st <> 'playing' THEN
    RAISE EXCEPTION 'room not playing';
  END IF;

  SELECT rp.last_seen_at INTO v_me_seen
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id AND rp.player_id = v_pid;
  IF v_me_seen IS NULL OR v_me_seen < now() - interval '30 seconds' THEN
    RAISE EXCEPTION 'caller not active';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = p_room_id
      AND rp.player_id <> v_pid
      AND rp.is_bot = false
      AND rp.last_seen_at > now() - interval '20 seconds'
  ) THEN
    RAISE EXCEPTION 'opponent still active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = p_room_id AND rp.player_id <> v_pid AND rp.is_bot = false
  ) THEN
    RAISE EXCEPTION 'no human opponent';
  END IF;

  SELECT rs.state INTO v_state FROM public.room_state rs WHERE rs.room_id = p_room_id;
  IF v_state IS NULL OR jsonb_typeof(v_state) <> 'object' THEN
    RAISE EXCEPTION 'no room_state';
  END IF;

  v_game_st := v_state->'game'->>'state';
  IF v_game_st IS NULL OR v_game_st <> 'playing' THEN
    RAISE EXCEPTION 'game not playing';
  END IF;

  SELECT rp.player_id INTO v_opp_id
  FROM public.room_players rp
  WHERE rp.room_id = p_room_id AND rp.is_bot = false AND rp.player_id <> v_pid
  ORDER BY rp.seat_index
  LIMIT 1;

  IF v_opp_id IS NULL THEN
    RAISE EXCEPTION 'no opponent id';
  END IF;

  UPDATE public.room_state rs
  SET state =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(rs.state, ARRAY['game', 'state'], '"finished"'::jsonb),
            ARRAY['game', 'phase'], '"game_over"'::jsonb
          ),
          ARRAY['game', 'winnerId'], to_jsonb(v_pid)
        ),
        ARRAY['game', 'loserId'], to_jsonb(v_opp_id)
      ),
      ARRAY['game', 'message'], 'null'::jsonb
    )
  WHERE rs.room_id = p_room_id;

  UPDATE public.rooms SET status = 'finished' WHERE id = p_room_id;

  SELECT rs.updated_at INTO out_updated_at FROM public.room_state rs WHERE rs.room_id = p_room_id;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.durak_forfeit_stale_opponent(uuid, text) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_forfeit_stale_opponent(uuid, text) TO anon, authenticated, service_role;
