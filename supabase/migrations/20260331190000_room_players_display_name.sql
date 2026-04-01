-- Совместимость: в актуальной схеме колонка называется player_name (как в Table Editor Supabase).
-- Если таблица без player_name — добавим и при необходимости перельём из display_name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_players' AND column_name = 'player_name'
  ) THEN
    ALTER TABLE public.room_players ADD COLUMN player_name text NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'room_players' AND column_name = 'display_name'
  ) THEN
    UPDATE public.room_players rp
    SET player_name = COALESCE(
      NULLIF(TRIM(rp.display_name), ''),
      NULLIF(TRIM(rp.player_name), ''),
      ''
    )
    WHERE TRIM(COALESCE(rp.player_name, '')) = '';
  END IF;
END $$;
