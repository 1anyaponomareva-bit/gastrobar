-- Страховка для быстрой очереди: если в комнате уже ≥2 живых игрока, а status всё ещё waiting
-- (старая версия finalize, сбой триггера и т.д.) — всё равно перевести в playing.

CREATE OR REPLACE FUNCTION public.durak_force_start_if_two_humans(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  SELECT count(*)::int INTO n
  FROM public.room_players
  WHERE room_id = p_room_id AND NOT COALESCE(is_bot, false);

  IF n < 2 THEN
    RETURN;
  END IF;

  UPDATE public.rooms r
  SET status = 'playing'
  WHERE r.id = p_room_id
    AND r.status = 'waiting'
    AND COALESCE(r.matchmaking_pool, true) = true;
END;
$$;

ALTER FUNCTION public.durak_force_start_if_two_humans(uuid) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_force_start_if_two_humans(uuid) TO anon, authenticated, service_role;

-- После вставки игрока: finalize + страховка на два живых (на сервере, без опроса клиента).
CREATE OR REPLACE FUNCTION public.durak_room_players_after_insert_finalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.durak_finalize_room_if_ready(NEW.room_id);
  PERFORM public.durak_force_start_if_two_humans(NEW.room_id);
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.durak_room_players_after_insert_finalize() SET row_security = off;
