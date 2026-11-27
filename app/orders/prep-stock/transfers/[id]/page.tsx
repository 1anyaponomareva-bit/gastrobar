import { PrepStockTransferPage } from "@/components/orders/PrepStockTransferPage";

export default async function OrdersPrepStockTransferRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PrepStockTransferPage transferId={id} />;
}
