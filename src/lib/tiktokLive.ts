/** Эфир по времени Вьетнама (Asia/Ho_Chi_Minh): 18:00–05:00; иначе офлайн. */
export function isLiveNowVietnam(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourStr = parts.find((p) => p.type === "hour")?.value;
  const hours = hourStr != null ? parseInt(hourStr, 10) : NaN;
  if (Number.isNaN(hours)) return false;
  return hours >= 18 || hours < 5;
}

export const liveUrl = "https://vm.tiktok.com/ZP9RQWuAPM58x-rSt8E/";
export const profileUrl = "https://www.tiktok.com/@gastrobarvn";
