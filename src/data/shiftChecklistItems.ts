import type { StaffInventoryVenue } from "@/data/staffInventoryItems";

export type ShiftType = "day" | "evening";
export type CleaningType = "regular" | "general";

export type ShiftChecklistItem = {
  id: string;
  section: string;
  label: string;
};

const GASTROFOOD_ITEMS: ShiftChecklistItem[] = [
  { id: "open-1", section: "Opening Shift", label: "Unlock doors and turn on lights" },
  { id: "open-2", section: "Opening Shift", label: "Check refrigerator and freezer temperatures" },
  { id: "open-3", section: "Opening Shift", label: "Inspect kitchen and dining area cleanliness" },
  { id: "open-4", section: "Opening Shift", label: "Wash hands and put on uniform / gloves" },
  { id: "open-5", section: "Opening Shift", label: "Turn on grill, fryer, and prep equipment" },
  { id: "open-6", section: "Opening Shift", label: "Check sauce and ingredient stock at stations" },
  { id: "during-1", section: "During Shift", label: "Follow food safety and hygiene standards" },
  { id: "during-2", section: "During Shift", label: "Keep workstations clean and organized" },
  { id: "close-1", section: "Closing Shift", label: "Clean grill, fryer, and cooking surfaces" },
  { id: "close-2", section: "Closing Shift", label: "Store all food in refrigerators" },
  { id: "close-3", section: "Closing Shift", label: "Empty trash and replace liners" },
  { id: "close-4", section: "Closing Shift", label: "Wash dishes and sanitize prep tables" },
  { id: "close-5", section: "Closing Shift", label: "Turn off equipment, lock doors, set alarm" },
  { id: "clean-1", section: "Cleaning", label: "Sweep and mop kitchen and guest area floors" },
  { id: "clean-2", section: "Cleaning", label: "Wipe tables, counters, and touchpoints" },
  { id: "clean-3", section: "Cleaning", label: "Clean restrooms and refill supplies" },
  { id: "clean-4", section: "Cleaning", label: "Deep clean hood filters and hard-to-reach areas" },
];

const GASTROBAR_ITEMS: ShiftChecklistItem[] = [
  { id: "open-1", section: "Opening Shift", label: "Unlock bar and turn on lights / music" },
  { id: "open-2", section: "Opening Shift", label: "Check ice machine, soda guns, and draft lines" },
  { id: "open-3", section: "Opening Shift", label: "Set up bar tools, glassware, and garnish station" },
  { id: "open-4", section: "Opening Shift", label: "Inspect hookah station and replace tips if needed" },
  { id: "open-5", section: "Opening Shift", label: "Count opening cash and verify POS is working" },
  { id: "during-1", section: "During Shift", label: "Follow cocktail and service standards" },
  { id: "during-2", section: "During Shift", label: "Keep bar top clean and stocked" },
  { id: "close-1", section: "Closing Shift", label: "Close tabs and run end-of-shift report" },
  { id: "close-2", section: "Closing Shift", label: "Wash glassware and bar tools" },
  { id: "close-3", section: "Closing Shift", label: "Cover bottles and secure alcohol storage" },
  { id: "close-4", section: "Closing Shift", label: "Clean hookah station and dispose of coals safely" },
  { id: "close-5", section: "Closing Shift", label: "Take out trash, lock bar, set alarm" },
  { id: "clean-1", section: "Cleaning", label: "Sweep and mop bar floor" },
  { id: "clean-2", section: "Cleaning", label: "Wipe tables, armrests, and high-touch surfaces" },
  { id: "clean-3", section: "Cleaning", label: "Clean restrooms and refill supplies" },
  { id: "clean-4", section: "Cleaning", label: "Deep clean fridges, shelves, and floor drains" },
];

export const SHIFT_CHECKLIST_BY_VENUE: Record<
  StaffInventoryVenue,
  ShiftChecklistItem[]
> = {
  gastrofood: GASTROFOOD_ITEMS,
  gastrobar: GASTROBAR_ITEMS,
};

export function getShiftChecklistItems(
  venue: StaffInventoryVenue,
  cleaning: CleaningType,
): ShiftChecklistItem[] {
  const items = SHIFT_CHECKLIST_BY_VENUE[venue];
  if (cleaning === "general") return items;
  return items.filter((item) => item.id !== "clean-4");
}

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  day: "Day Shift",
  evening: "Evening Shift",
};

export const CLEANING_TYPE_LABELS: Record<CleaningType, string> = {
  regular: "Regular Cleaning",
  general: "General Cleaning",
};
