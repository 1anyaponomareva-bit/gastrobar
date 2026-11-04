import { ProductCard } from "@/components/erp/ProductsPage";

export default async function ErpProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductCard id={id} />;
}
