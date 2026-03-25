import { supabase } from "@/lib/supabaseClient";

/** Запись спина в Supabase (вызывать из клиента после завершения анимации). */
export async function sendSpin(result: string) {
  try {
    const userId = localStorage.getItem("user_id") || crypto.randomUUID();
    localStorage.setItem("user_id", userId);

    const { error } = await supabase.from("spins").insert([
      {
        user_id: userId,
        result: result,
      },
    ]);

    if (error) {
      console.error("spin error", error);
      return;
    }

    console.log("spin saved", result);
  } catch (e) {
    console.error("spin error", e);
  }
}
