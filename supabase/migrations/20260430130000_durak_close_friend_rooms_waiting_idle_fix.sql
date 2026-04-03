-- Уточнение «последней активности» для столов с друзьями.
-- В лобби (status = waiting) не учитываем room_state.updated_at: иначе редкие записи
-- состояния в waiting бесконечно откладывают закрытие заброшенного стола.
-- В партии (playing) по-прежнему учитываем обновления стола.

CREATE OR REPLACE FUNCTION public.durak_close_inactive_friend_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  WITH stale AS (
    SELECT r.id
    FROM public.rooms r
    WHERE COALESCE(r.matchmaking_pool, true) = false
      AND r.status = ANY (ARRAY['waiting'::text, 'playing'::text])
      AND (
        CASE
          WHEN r.status = 'waiting' THEN GREATEST(
            r.created_at,
            COALESCE((SELECT MAX(rp.last_seen_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at),
            COALESCE((SELECT MAX(rp.joined_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at)
          )
          ELSE GREATEST(
            r.created_at,
            COALESCE((SELECT MAX(rs.updated_at) FROM public.room_state rs WHERE rs.room_id = r.id), r.created_at),
            COALESCE((SELECT MAX(rp.last_seen_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at),
            COALESCE((SELECT MAX(rp.joined_at) FROM public.room_players rp WHERE rp.room_id = r.id), r.created_at)
          )
        END
      ) < now() - interval '20 minutes'
  )
  UPDATE public.rooms u
  SET status = 'finished'
  FROM stale s
  WHERE u.id = s.id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

ALTER FUNCTION public.durak_close_inactive_friend_rooms() SET row_security = off;
REVOKE ALL ON FUNCTION public.durak_close_inactive_friend_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.durak_close_inactive_friend_rooms() TO postgres;
GRANT EXECUTE ON FUNCTION public.durak_close_inactive_friend_rooms() TO service_role;
GRANT EXECUTE ON FUNCTION public.durak_close_inactive_friend_rooms() TO anon, authenticated;

-- Периодическая уборка без клиента (если в проекте включён pg_cron):
--   create extension if not exists pg_cron with schema extensions;
--   select cron.schedule('durak-friend-idle', '*/5 * * * *', $$select public.durak_close_inactive_friend_rooms()$$);
