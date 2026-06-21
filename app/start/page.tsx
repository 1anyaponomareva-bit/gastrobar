import { redirect } from "next/navigation";

/** Старый URL экрана выбора — ведём на главную. */
export default function MenuChooserRedirectPage() {
  redirect("/");
}
