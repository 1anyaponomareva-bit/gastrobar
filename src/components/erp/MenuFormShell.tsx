"use client";

import type { ReactNode } from "react";
import { MenuMobileNav } from "./menuNav";
import { NavLink, PageHead, T } from "./ui";

export function MenuFormShell({
  backHref,
  backLabel,
  activeHref,
  title,
  sub,
  printLabel,
  onPrint,
  children,
  footer,
}: {
  backHref: string;
  backLabel: string;
  activeHref: string;
  title: ReactNode;
  sub?: ReactNode;
  printLabel?: string;
  onPrint?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="erpMenu erpMenuForm">
      <NavLink href={backHref} className="erpBack">
        ← {backLabel}
      </NavLink>
      <PageHead
        title={title}
        sub={sub}
        actions={
          onPrint ? (
            <button type="button" className="erpHeadBtn" onClick={onPrint}>
              {printLabel ?? T("Распечатать", "Print", "In")}
            </button>
          ) : null
        }
      />
      <MenuMobileNav active={activeHref} />
      <div className="erpMenuFormBody">{children}</div>
      {footer ? <div className="erpMenuSave erpNoPrint">{footer}</div> : null}
    </div>
  );
}
