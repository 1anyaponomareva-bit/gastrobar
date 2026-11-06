import { PurchasingOrderCard } from "@/components/erp/PurchasingOrderCard";

export default async function ErpPurchasingOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchasingOrderCard id={id} />;
}
