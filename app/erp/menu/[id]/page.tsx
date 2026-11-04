import { DishPage } from "@/components/erp/MenuPage";

export default async function ErpDishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DishPage id={id} />;
}
