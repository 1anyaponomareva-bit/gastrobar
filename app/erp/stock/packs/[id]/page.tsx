import { PackCard } from "@/components/erp/PacksPage";

export default async function ErpStockPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PackCard id={id} />;
}
