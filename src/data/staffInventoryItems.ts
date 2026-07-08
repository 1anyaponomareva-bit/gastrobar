import gastrobarItems from "./staffInventoryGastrobar.json";
import gastrofoodItems from "./staffInventoryGastrofood.json";

export type StaffInventoryVenue = "gastrofood" | "gastrobar";

export type StaffInventoryItemTuple =
  | [category: string, name: string, unit: string]
  | [category: string, name: string, neededUnit: string, leftUnit: string];

export function getStaffInventoryUnits(
  item: StaffInventoryItemTuple,
): { neededUnit: string; leftUnit: string } {
  if (item.length >= 4) {
    return {
      neededUnit: item[2] as string,
      leftUnit: item[3] as string,
    };
  }
  const unit = item[2];
  return { neededUnit: unit, leftUnit: unit };
}

export const STAFF_INVENTORY_VENUES: StaffInventoryVenue[] = [
  "gastrofood",
  "gastrobar",
];

export const STAFF_INVENTORY_BY_VENUE: Record<
  StaffInventoryVenue,
  StaffInventoryItemTuple[]
> = {
  gastrofood: gastrofoodItems as StaffInventoryItemTuple[],
  gastrobar: gastrobarItems as StaffInventoryItemTuple[],
};

export function getStaffInventoryItems(
  venue: StaffInventoryVenue,
): StaffInventoryItemTuple[] {
  return STAFF_INVENTORY_BY_VENUE[venue];
}

export function getStaffInventoryCategories(
  venue: StaffInventoryVenue,
): string[] {
  const items = getStaffInventoryItems(venue);
  return ["All", ...Array.from(new Set(items.map((item) => item[0])))];
}

export const STAFF_INVENTORY_VENUE_LABELS: Record<StaffInventoryVenue, string> =
  {
    gastrofood: "GastroFood",
    gastrobar: "GastroBar",
  };

export const STAFF_INVENTORY_VENUE_LOGOS: Record<StaffInventoryVenue, string> =
  {
    gastrofood: "/food/menu/GASTROFOOD.png",
    gastrobar: "/menu/Logo.png",
  };
