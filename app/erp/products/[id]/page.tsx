import { ProductCard } from "@/components/erp/ProductsPage";

export default async function ErpProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  return <ProductCard id={id} presetType={type} />;
}
