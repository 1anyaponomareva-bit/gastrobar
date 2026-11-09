"use client";

import { shouldShowOrderZalo, supplierZaloHref } from "@/lib/orders/orderList";

type Props = {
  status: string | null | undefined;
  zaloUrl?: string | null;
  label: string;
  className?: string;
};

export function OrderZaloButton({ status, zaloUrl, label, className }: Props) {
  if (!shouldShowOrderZalo(status, zaloUrl)) return null;
  const href = supplierZaloHref(zaloUrl);
  if (!href) return null;
  return (
    <a
      className={`orders-btn zalo block${className ? ` ${className}` : ""}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
    </a>
  );
}
