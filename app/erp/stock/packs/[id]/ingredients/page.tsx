import { PackIngredientsPage } from "@/components/erp/PacksPage";

export default async function ErpStockPackIngredientsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PackIngredientsPage id={id} />;
}
