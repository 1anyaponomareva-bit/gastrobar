import { FinanceShiftEditPage } from "@/components/erp/FinanceShiftsPage";

export default async function ErpFinanceShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceShiftEditPage id={id} />;
}
