import { FinanceEmployeeEditPage } from "@/components/erp/FinanceSalaryPage";

export default async function ErpFinanceEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceEmployeeEditPage id={id} />;
}
