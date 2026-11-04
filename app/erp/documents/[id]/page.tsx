import { DocumentEditor } from "@/components/erp/DocumentEditor";

export default async function ErpDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentEditor id={id} />;
}
