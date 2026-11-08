import { FinanceCategoryEditPage } from "@/components/erp/FinanceCategoriesPage";

export default async function ErpFinanceCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceCategoryEditPage id={id} />;
}
