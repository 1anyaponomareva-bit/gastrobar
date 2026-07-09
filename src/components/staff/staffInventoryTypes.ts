export type StaffInventoryRow = {
  index: number;
  category: string;
  name: string;
  neededUnit: string;
  leftUnit: string;
  current: number;
  needed: number;
  hasCurrent: boolean;
  hasNeeded: boolean;
};
