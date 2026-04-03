-- 1) Последние 10 rooms
SELECT id, status, max_players, created_at
FROM public.rooms
ORDER BY created_at DESC
LIMIT 10;

-- 2) Последние 20 room_players
SELECT room_id, player_id, is_bot, seat_index, joined_at
FROM public.room_players
ORDER BY joined_at DESC
LIMIT 20;

-- 3) Сводка по свежим комнатам (последние 15): humans / bots
WITH recent AS (
  SELECT id AS room_id
  FROM public.rooms
  ORDER BY created_at DESC
  LIMIT 15
)
SELECT
  r.room_id,
  rm.status,
  rm.matchmaking_pool,
  rm.search_deadline,
  rm.max_players,
  COUNT(*) FILTER (WHERE NOT COALESCE(rp.is_bot, false))::int AS human_players,
  COUNT(*) FILTER (WHERE COALESCE(rp.is_bot, false))::int AS bot_players,
  COUNT(*)::int AS total_players
FROM recent r
JOIN public.rooms rm ON rm.id = r.room_id
LEFT JOIN public.room_players rp ON rp.room_id = r.room_id
GROUP BY r.room_id, rm.status, rm.matchmaking_pool, rm.search_deadline, rm.max_players
ORDER BY rm.search_deadline DESC NULLS LAST;

-- 4) Комнаты waiting, где уже есть игроки — подсказка почему не playing
SELECT
  rm.id AS room_id,
  rm.status,
  rm.matchmaking_pool,
  rm.search_deadline,
  rm.created_at,
  COUNT(rp.*)::int AS total_players,
  COUNT(*) FILTER (WHERE NOT COALESCE(rp.is_bot, false))::int AS humans,
  COUNT(*) FILTER (WHERE COALESCE(rp.is_bot, false))::int AS bots,
  (rm.search_deadline < now()) AS deadline_passed,
  (NOT COALESCE(rm.matchmaking_pool, true)) AS is_friend_table,
  CASE
    WHEN rm.status <> 'waiting' THEN 'not waiting'
    WHEN NOT COALESCE(rm.matchmaking_pool, true) THEN 'friend room: playing only when total >= max_players'
    WHEN COUNT(*) FILTER (WHERE NOT COALESCE(rp.is_bot, false)) >= 2 THEN 'expected: humans>=2 → finalize should set playing (check function version + trigger)'
    WHEN rm.search_deadline >= now() AND COUNT(*) FILTER (WHERE NOT COALESCE(rp.is_bot, false)) = 1
      THEN 'solo in search window: playing after deadline + bot'
    WHEN rm.search_deadline < now() AND COUNT(*) FILTER (WHERE NOT COALESCE(rp.is_bot, false)) = 1 AND COUNT(*)::int >= 1
      THEN 'solo after deadline: finalize should add bot + playing (check durak_finalize_room_if_ready)'
    WHEN COUNT(*)::int = 0 THEN 'no players row'
    ELSE 'other'
  END AS finalize_hint
FROM public.rooms rm
LEFT JOIN public.room_players rp ON rp.room_id = rm.id
WHERE rm.status = 'waiting'
GROUP BY rm.id, rm.status, rm.matchmaking_pool, rm.search_deadline, rm.created_at
HAVING COUNT(rp.*) > 0
ORDER BY rm.created_at DESC
LIMIT 20;

