/** Vietnam wall clock (no DST). Postgres timestamptz arrives as UTC ISO. */
export const VIETNAM_TZ = "Asia/Ho_Chi_Minh";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function part(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

function vietnamParts(date: Date, withTime: boolean): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: VIETNAM_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  }).formatToParts(date);
}

function vietnamYmdHm(date: Date): { year: string; month: string; day: string; hour: string; minute: string } {
  const parts = vietnamParts(date, true);
  let hour = part(parts, "hour");
  if (hour === "24") hour = "00";
  return {
    year: part(parts, "year"),
    month: part(parts, "month"),
    day: part(parts, "day"),
    hour: hour.padStart(2, "0"),
    minute: part(parts, "minute").padStart(2, "0"),
  };
}

/** Calendar date `YYYY-MM-DD` in Asia/Ho_Chi_Minh. Independent of the JS engine timezone. */
export function vietnamTodayIso(now: Date = new Date()): string {
  const { year, month, day } = vietnamYmdHm(now);
  return year && month && day ? `${year}-${month}-${day}` : "";
}

/** Clock `HH:mm` in Asia/Ho_Chi_Minh. */
export function vietnamNowTime(now: Date = new Date()): string {
  const { hour, minute } = vietnamYmdHm(now);
  return hour && minute ? `${hour}:${minute}` : "";
}

/** `YYYY-MM-DDTHH:mm` wall time in Asia/Ho_Chi_Minh (datetime-local inputs). */
export function vietnamDateTimeLocal(now: Date = new Date()): string {
  const { year, month, day, hour, minute } = vietnamYmdHm(now);
  if (!year || !month || !day || !hour || !minute) return "";
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** Calendar `YYYY-MM-DD`: date-only strings stay put; instants convert in Vietnam. */
export function vietnamIsoDate(value: string | Date): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (DATE_ONLY.test(trimmed)) return trimmed;
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? "" : vietnamTodayIso(date);
  }
  return Number.isNaN(value.getTime()) ? "" : vietnamTodayIso(value);
}

function joinDate(parts: Intl.DateTimeFormatPart[]): string {
  const day = part(parts, "day");
  const month = part(parts, "month");
  const year = part(parts, "year");
  if (!day || !month || !year) return "";
  return `${day}.${month}.${year}`;
}

function joinDateTime(parts: Intl.DateTimeFormatPart[]): string {
  const date = joinDate(parts);
  if (!date) return "";
  let hour = part(parts, "hour");
  if (hour === "24") hour = "00";
  const minute = part(parts, "minute");
  if (!hour || !minute) return date;
  return `${date} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Calendar date `dd.mm.yyyy`. Date-only strings stay on that calendar day. */
export function formatVietnamDate(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    return `${day}.${month}.${year}`;
  }
  const date = parseInstant(trimmed);
  return date ? joinDate(vietnamParts(date, false)) : "";
}

/** `dd.mm.yyyy HH:mm` in Asia/Ho_Chi_Minh. Date-only values omit the time. */
export function formatVietnamDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (DATE_ONLY.test(trimmed)) return formatVietnamDate(trimmed);
  const date = parseInstant(trimmed);
  return date ? joinDateTime(vietnamParts(date, true)) : "";
}

/** Date that belongs next to the status chip: received → when received, otherwise when ordered. */
export function orderStatusInstant(order: {
  status: string;
  receivedAt?: string | null;
  placedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  if (order.status === "received" || order.status === "partial") {
    return order.receivedAt || order.placedAt || order.createdAt || null;
  }
  return order.placedAt || order.createdAt || null;
}
