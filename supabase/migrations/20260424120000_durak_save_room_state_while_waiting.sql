-- Быстрый матч может открыть стол при rooms.status = 'waiting' (до finalize).
-- Раньше при waiting + уже есть room_state RPC кидал «room_state already exists» и не доходил
-- до INSERT ... ON CONFLICT DO UPDATE — второй игрок и любые ходы получали 400, poll не видел карт.

CREATE OR REPLACE FUNCTION public.durak_save_room_state(payload jsonb)
RETURNS TABLE (out_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
  pid text;
  st jsonb;
  room_st text;
  sz int;
BEGIN
  BEGIN
    rid := (payload->>'room_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid room_id';
  END;

  pid := nullif(trim(coalesce(payload->>'player_id', '')), '');
  IF pid IS NULL OR length(pid) < 1 OR length(pid) > 256 THEN
    RAISE EXCEPTION 'invalid player_id';
  END IF;

  st := payload->'state';
  IF st IS NULL OR jsonb_typeof(st) <> 'object' THEN
    RAISE EXCEPTION 'state must be a json object';
  END IF;

  IF st->'game' IS NULL OR jsonb_typeof(st->'game') <> 'object' THEN
    RAISE EXCEPTION 'state.game object required';
  END IF;

  sz := pg_column_size(st);
  IF sz IS NULL OR sz > 450000 THEN
    RAISE EXCEPTION 'state too large';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_players rp
    WHERE rp.room_id = rid AND rp.player_id = pid
  ) THEN
    RAISE EXCEPTION 'not a room member';
  END IF;

  SELECT r.status::text INTO room_st FROM public.rooms r WHERE r.id = rid;
  IF room_st IS NULL THEN
    RAISE EXCEPTION 'room not found';
  END IF;
  IF room_st = 'finished' THEN
    RAISE EXCEPTION 'room finished';
  END IF;

  INSERT INTO public.room_state (room_id, state)
  VALUES (rid, st)
  ON CONFLICT (room_id) DO UPDATE SET state = EXCLUDED.state;

  SELECT rs.updated_at INTO out_updated_at FROM public.room_state rs WHERE rs.room_id = rid;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.durak_save_room_state(jsonb) SET row_security = off;
