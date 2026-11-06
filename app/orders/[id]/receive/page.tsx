import { ReceiveForm } from "@/components/orders/ReceiveForm";

export default async function OrderReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReceiveForm orderId={id} />;
}
