import { RecipePage } from "@/components/erp/PrepsPage";

export default async function ErpRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipePage id={id} />;
}
