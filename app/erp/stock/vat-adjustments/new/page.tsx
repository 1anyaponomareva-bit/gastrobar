"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { VatAdjustmentEditor } from "@/components/erp/VatAdjustmentEditor";
import { Empty, loadingText, T } from "@/components/erp/ui";

function Inner() {
  const params = useSearchParams();
  const lineId = params.get("line");
  const documentId = params.get("document");
  if (!lineId) {
    return (
      <Empty
        kind="error"
        title={T("Не указана строка поставки", "Purchase line missing", "Thiếu dòng nhập")}
        text={T("Откройте корректировку из карточки проведённой поставки.", "Open the adjustment from a posted delivery card.", "Mở từ phiếu nhập đã ghi sổ.")}
      />
    );
  }
  return <VatAdjustmentEditor sourceLineId={lineId} sourceDocumentId={documentId} />;
}

export default function ErpVatAdjustmentNewPage() {
  return (
    <Suspense fallback={<div className="erpLoading">{loadingText()}</div>}>
      <Inner />
    </Suspense>
  );
}
