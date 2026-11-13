import { StockDocsPage } from "@/components/erp/StockPage";
import { erpRedirect } from "@/lib/erp/erpRedirect";

export default async function ErpStockDocsPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind === "history") await erpRedirect("/erp/stock");
  if (kind === "processing") await erpRedirect("/erp/menu/processing");
  return <StockDocsPage kind={kind} />;
}
