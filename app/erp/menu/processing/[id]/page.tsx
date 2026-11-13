import { ProcessingEditor } from "@/components/erp/ProcessingEditor";

export default async function ErpMenuProcessingDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProcessingEditor id={id} />;
}
