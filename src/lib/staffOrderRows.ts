import { staffItemLabel, staffItemPackLabel, staffUnitLabel, type StaffCatalogItem } from "@/data/staffCatalog";
import type { SupplierOrderPdfRow } from "@/lib/staffInventoryPdf";

/** Rows of a supplier order PDF: visible items of that supplier with a quantity above zero. */
export function supplierOrderRows(
  items: StaffCatalogItem[],
  supplierId: string,
  quantityOf: (itemId: string) => number,
): SupplierOrderPdfRow[] {
  return items
    .filter((item) => !item.hidden && item.supplier === supplierId && quantityOf(item.id) > 0)
    .map((item) => ({
      name: staffItemLabel(item),
      details: item.brand ?? "",
      packInfo: staffItemPackLabel(item, staffUnitLabel(item.unit)) ?? undefined,
      quantity: quantityOf(item.id),
      unit: staffUnitLabel(item.unit),
      itemNo: item.itemNo,
    }));
}
