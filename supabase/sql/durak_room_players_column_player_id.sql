-- ============================================================================
-- Выравнивание колонки идентификатора игрока в `room_players`
-- Код приложения и RPC ожидают колонку: player_id (text)
-- ============================================================================
-- Выполни в Supabase SQL Editor ПЕРЕД durak_queue_functions_only.sql, если была ошибка
-- "column ... player_public_id does not exist" или нужно привести схему к одному виду.
-- ============================================================================

-- 1) Старая миграция называла колонку player_public_id — переименуем в player_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_players' AND column_name = 'player_public_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_players' AND column_name = 'player_id'
  ) THEN
    ALTER TABLE public.room_players RENAME COLUMN player_public_id TO player_id;
  END IF;
END $$;

-- 2) Если вместо этого используется user_id (uuid) — дублируем в player_id (text)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_players' AND column_name = 'player_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_players' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.room_players ADD COLUMN player_id text;
    UPDATE public.room_players SET player_id = user_id::text WHERE player_id IS NULL;
    -- При необходимости сделай NOT NULL после проверки данных:
    -- ALTER TABLE public.room_players ALTER COLUMN player_id SET NOT NULL;
  END IF;
END $$;

-- 3) Если после переименования нет UNIQUE(room_id, player_id), добавь вручную в Table Editor
--    или: CREATE UNIQUE INDEX IF NOT EXISTS room_players_room_player_uidx ON public.room_players (room_id, player_id);
