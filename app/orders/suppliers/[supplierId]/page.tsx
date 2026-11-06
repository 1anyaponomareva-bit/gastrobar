import { SupplierOrderList } from "@/components/orders/SupplierOrderList";

export default async function SupplierOrderPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  return <SupplierOrderList supplierId={supplierId} />;
}
