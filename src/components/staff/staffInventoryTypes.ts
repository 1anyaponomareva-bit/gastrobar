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

export type StaffStockRow = {
  id: string;
  name: string;
  restaurant: number;
  warehouse: number;
  hasRestaurant: boolean;
  hasWarehouse: boolean;
  noWarehouse: boolean;
  unit: string;
  filled: boolean;
  lowInHouse: boolean;
  lowWarehouse: boolean;
  task: string | null;
};
