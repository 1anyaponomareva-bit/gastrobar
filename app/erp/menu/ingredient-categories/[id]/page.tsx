import { MenuIngredientCategoryEditPage } from "@/components/erp/MenuIngredientCategoriesPage";

export default async function ErpMenuIngredientCategoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MenuIngredientCategoryEditPage id={id} />;
}
