import { OrderCard } from "@/components/orders/OrderCard";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderCard orderId={id} />;
}
