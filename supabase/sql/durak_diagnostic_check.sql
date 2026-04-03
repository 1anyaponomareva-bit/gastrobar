-- Диагностика: «в Table Editor пусто» при быстрой игре.
-- Выполняйте в том же проекте Supabase, что в Vercel: Settings → API → Project URL
--    должен совпадать с NEXT_PUBLIC_SUPABASE_URL (или SUPABASE_URL).

-- 1) Есть ли таблицы
SELECT
  to_regclass('public.rooms') AS rooms_table,
  to_regclass('public.room_players') AS room_players_table;

-- 2) Есть ли RPC (должна быть одна строка с jsonb)
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'durak_join_queue';

-- 3) Один тестовый вызов очереди (создаёт комнату + игрока, если всё залито)
-- После выполнения снова откройте Table Editor или пункт 4.
SELECT *
FROM public.durak_join_queue(
  jsonb_build_object(
    'player_id', 'sql-diag-' || substr(md5(random()::text), 1, 12),
    'display_name', 'Проверка SQL'
  )
);

-- 4) Последние комнаты и игроки
SELECT id, status, matchmaking_pool, search_deadline, created_at
FROM public.rooms
ORDER BY created_at DESC
LIMIT 5;

SELECT room_id, player_id, is_bot, seat_index, joined_at
FROM public.room_players
ORDER BY joined_at DESC
LIMIT 10;
