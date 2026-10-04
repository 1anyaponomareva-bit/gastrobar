import type { KitchenShift } from "@/data/kitchenChecklist";

const STORAGE_KEY = "gastrofood-kitchen-checklist-v1";

type StoredKitchenChecklist = {
  date: string;
  employee: string;
  shift: KitchenShift;
  checked: Record<string, boolean>;
};

function emptyState(date: string): StoredKitchenChecklist {
  return { date, employee: "", shift: "day", checked: {} };
}

export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function formatKitchenDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year}`;
}

function readStore(): StoredKitchenChecklist {
  const today = todayIsoDate();
  if (typeof window === "undefined") return emptyState(today);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState(today);
    const parsed = JSON.parse(raw) as StoredKitchenChecklist;
    if (!parsed || parsed.date !== today) {
      const next = emptyState(today);
      next.employee = typeof parsed?.employee === "string" ? parsed.employee : "";
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    }
    return {
      date: today,
      employee: typeof parsed.employee === "string" ? parsed.employee : "",
      shift: parsed.shift === "evening" ? "evening" : "day",
      checked: parsed.checked && typeof parsed.checked === "object" ? parsed.checked : {},
    };
  } catch {
    return emptyState(today);
  }
}

function writeStore(state: StoredKitchenChecklist): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadKitchenChecklist(): StoredKitchenChecklist {
  return readStore();
}

export function saveKitchenEmployee(employee: string): void {
  const state = readStore();
  state.employee = employee;
  writeStore(state);
}

export function saveKitchenShift(shift: KitchenShift): void {
  const state = readStore();
  state.shift = shift;
  writeStore(state);
}

export function saveKitchenCheck(id: string, checked: boolean): void {
  const state = readStore();
  state.checked[id] = checked;
  writeStore(state);
}
