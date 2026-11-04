import { redirect } from "next/navigation";
import { StockDocsPage } from "@/components/erp/StockPage";

export default async function ErpStockDocsPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (kind === "history") redirect("/erp/stock");
  return <StockDocsPage kind={kind} />;
}
