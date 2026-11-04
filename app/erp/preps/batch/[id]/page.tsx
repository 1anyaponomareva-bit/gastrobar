import { ProductionWizard } from "@/components/erp/ProductionWizard";

export default async function ErpBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductionWizard id={id} />;
}
