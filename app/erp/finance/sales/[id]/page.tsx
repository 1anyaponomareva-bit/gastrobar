import { FinanceSalesDetailPage } from "@/components/erp/FinanceSalesPage";

export default async function ErpFinanceSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceSalesDetailPage id={id} />;
}
