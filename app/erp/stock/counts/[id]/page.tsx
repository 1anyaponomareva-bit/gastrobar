import { InventoryEditor } from "@/components/erp/InventoryEditor";

export default async function ErpInventoryDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InventoryEditor id={id} />;
}
