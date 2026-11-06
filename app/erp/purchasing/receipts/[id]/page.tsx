import { PurchasingReceiptPage } from "@/components/erp/PurchasingReceiptPanel";

export default async function ErpPurchasingReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PurchasingReceiptPage id={id} />;
}
