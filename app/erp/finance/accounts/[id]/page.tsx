import { FinanceAccountEditPage } from "@/components/erp/FinanceAccountsPage";

export default async function ErpFinanceAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceAccountEditPage id={id} />;
}
