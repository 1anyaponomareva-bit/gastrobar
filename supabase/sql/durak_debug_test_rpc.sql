-- ============================================================================
-- Диагностика: обойти PostgREST и проверить, что RPC живёт в PostgreSQL.
-- Выполни в Supabase → SQL Editor. Если здесь ошибка — текст будет из Postgres.
-- Если здесь OK, а в приложении 500 — смотри ключи API, прокси, GRANT USAGE ON SCHEMA public.
-- ============================================================================

SELECT * FROM public.durak_join_queue(
  jsonb_build_object(
    'player_id', 'sql-test-' || substr(md5(random()::text), 1, 10),
    'display_name', 'SQL Editor'
  )
);

-- Список перегрузок RPC (должна быть одна durak_join_queue с jsonb):
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname LIKE 'durak%'
ORDER BY p.proname, args;
