"use client";

import type { OrderStatus, ReceiptDocStatus } from "@/lib/orders/types";
import { T } from "./ui";

export function purchasingStatusLabel(status: string): string {
  return (
    {
      draft: T("Черновик", "Draft", "Nháp"),
      ordered: T("Заказан", "Ordered", "Đã đặt"),
      partial: T("Частично получен", "Partial", "Nhận một phần"),
      received: T("Получен", "Received", "Đã nhận"),
      closed: T("Закрыт", "Closed", "Đã đóng"),
      posted: T("Проведён", "Posted", "Đã ghi sổ"),
      cancelled: T("Отменён", "Cancelled", "Đã hủy"),
      clarify: T("На уточнении", "To clarify", "Cần làm rõ"),
    }[status] ?? status
  );
}

export function PurchasingStatusBadge({ status }: { status: OrderStatus | ReceiptDocStatus | string }) {
  const tone = status === "closed" || status === "posted" || status === "received" ? "ok" : status === "cancelled" || status === "clarify" ? "bad" : status === "partial" ? "warn" : "";
  return <span className={`erpBadge ${tone}`}>{purchasingStatusLabel(status)}</span>;
}
