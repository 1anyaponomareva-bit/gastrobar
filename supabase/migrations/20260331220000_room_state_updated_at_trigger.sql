-- На каждом UPDATE всегда новый updated_at (микросекунды в БД), чтобы Realtime и клиенты
-- не получали два подряд одинаковых timestamp с разным JSON state.
CREATE OR REPLACE FUNCTION public.touch_room_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS room_state_set_updated_at ON public.room_state;
CREATE TRIGGER room_state_set_updated_at
BEFORE INSERT OR UPDATE ON public.room_state
FOR EACH ROW
EXECUTE PROCEDURE public.touch_room_state_updated_at();
