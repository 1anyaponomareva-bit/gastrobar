import { FinanceTransactionEditPage } from "@/components/erp/FinanceTransactionsPage";

export default async function ErpFinanceTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceTransactionEditPage id={id} />;
}
