"use client";

import Link from "next/link";
import { shouldShowOrderZalo, supplierZaloHref } from "@/lib/orders/orderList";

type Props = {
  status: string | null | undefined;
  zaloUrl?: string | null;
  zaloLabel: string;
  openLabel: string;
  openHref?: string;
  onOpen?: () => void;
  openBusy?: boolean;
  className?: string;
};

/** Half Zalo (chat) + half Open. Hidden without a group URL and on draft/pre-order. */
export function OrderZaloOpenRow({
  status,
  zaloUrl,
  zaloLabel,
  openLabel,
  openHref,
  onOpen,
  openBusy,
  className,
}: Props) {
  if (!shouldShowOrderZalo(status, zaloUrl)) return null;
  const href = supplierZaloHref(zaloUrl);
  if (!href) return null;
  return (
    <div className={`orders-zaloOpenRow${className ? ` ${className}` : ""}`}>
      <a className="orders-btn zalo orders-zaloHalf" href={href} target="_blank" rel="noopener noreferrer">
        {zaloLabel}
      </a>
      {openHref ? (
        <Link className="orders-btn orders-openHalf" href={openHref}>
          {openLabel}
        </Link>
      ) : onOpen ? (
        <button type="button" className="orders-btn orders-openHalf" onClick={onOpen} disabled={Boolean(openBusy)}>
          {openLabel}
        </button>
      ) : null}
    </div>
  );
}
