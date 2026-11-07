import { OrderList } from "@/components/orders/OrderList";

export default async function SupplierOrderPage({ params }: { params: Promise<{ supplierId: string }> }) {
  const { supplierId } = await params;
  return <OrderList initialTab={supplierId} />;
}
