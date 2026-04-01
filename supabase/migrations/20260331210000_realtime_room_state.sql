-- Realtime: события UPDATE по room_state (иначе второй клиент не получает ходы по WebSocket).
-- На hosted Supabase обычно достаточно этого; иначе Dashboard → Database → Replication → room_state.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'room_state'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_state;
  END IF;
END $$;
