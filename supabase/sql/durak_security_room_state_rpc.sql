-- Безопасность дурака онлайн (анонимные игроки):
-- 1) Запись в room_state только через RPC durak_save_room_state (проверка membership).
-- 2) Прямые INSERT/UPDATE в rooms / room_players / room_state с роли anon — отозваны; чтение SELECT сохранено (matchmaking + poll).
-- 3) Политики ALL(true) на запись сняты — остаётся только SELECT.
--
-- Полная изоляция «вижу только свои комнаты» без подмены JWT требует Supabase Auth (или Edge custodial).
-- После применения: задеплой приложение с вызовом durak_save_room_state вместо upsert room_state.

-- Запись состояния партии: только участник комнаты, комната не finished.
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

  -- waiting или playing: один upsert (первый сид + последующие ходы). Быстрый матч может
  -- показывать стол при status=waiting до finalize — блок «already exists» ломал синхронизацию.

  INSERT INTO public.room_state (room_id, state)
  VALUES (rid, st)
  ON CONFLICT (room_id) DO UPDATE SET state = EXCLUDED.state;

  SELECT rs.updated_at INTO out_updated_at FROM public.room_state rs WHERE rs.room_id = rid;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.durak_save_room_state(jsonb) SET row_security = off;
GRANT EXECUTE ON FUNCTION public.durak_save_room_state(jsonb) TO anon, authenticated, service_role;

-- ---- RLS: убрать открытую запись на таблицы ----

DROP POLICY IF EXISTS rooms_insert_all ON public.rooms;
DROP POLICY IF EXISTS rooms_update_all ON public.rooms;
DROP POLICY IF EXISTS room_players_insert_all ON public.room_players;
DROP POLICY IF EXISTS room_state_all ON public.room_state;

-- SELECT оставляем для клиента (списки столов, poll, отладка).
-- Прямая запись запрещена отсутствием политик INSERT/UPDATE (RLS) + REVOKE ниже.

DROP POLICY IF EXISTS rooms_select_all ON public.rooms;
CREATE POLICY rooms_select_all ON public.rooms FOR SELECT USING (true);

DROP POLICY IF EXISTS room_players_select_all ON public.room_players;
CREATE POLICY room_players_select_all ON public.room_players FOR SELECT USING (true);

DROP POLICY IF EXISTS room_state_select_all ON public.room_state;
CREATE POLICY room_state_select_all ON public.room_state FOR SELECT USING (true);

-- Отозвать DML у anon/authenticated (RPC владельца схемы всё ещё может писать из DEFINER-функций).
REVOKE INSERT, UPDATE, DELETE ON public.rooms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.room_players FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.room_state FROM anon, authenticated;
