import { ProductCard } from "@/components/erp/ProductsPage";

export default async function ErpProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; from?: string }>;
}) {
  const { id } = await params;
  const { type, from } = await searchParams;
  return <ProductCard id={id} presetType={type} from={from} />;
}
