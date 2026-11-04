import { StockDocsPage } from "@/components/erp/StockPage";

export default async function ErpStockDocsPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  return <StockDocsPage kind={kind} />;
}
