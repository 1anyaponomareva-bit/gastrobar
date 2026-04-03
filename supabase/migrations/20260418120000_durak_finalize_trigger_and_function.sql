-- 1) Повторно применяем финализацию (на случай, если 20260416120000 не катили).
-- 2) Триггер: любой INSERT в room_players дергает finalize на сервере — не зависит от опроса клиента в фоне.

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
ALTER FUNCTION public.durak_finalize_room_if_ready(uuid) SET row_security = off;
