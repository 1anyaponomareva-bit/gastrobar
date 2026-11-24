"use client";

import { useEffect, useRef, useState } from "react";
import {
  contentLangLabel,
  extraContentLangs,
  type ContentLangCode,
} from "@/lib/erp/contentLang";
import { T, erpLang } from "./i18n";

export function ContentLangBar({
  langs,
  locked = ["en", "vn"],
  onAdd,
  onRemove,
}: {
  langs: ContentLangCode[];
  locked?: readonly string[];
  onAdd: (code: ContentLangCode) => void;
  onRemove: (code: ContentLangCode) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const ui = erpLang();
  const available = extraContentLangs(langs);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div className="erpLangBar" data-testid="content-lang-bar">
      <div className="erpLangChips" role="list">
        {langs.map((code) => (
          <span key={code} className="erpLangChip" role="listitem">
            {contentLangLabel(code, ui)}
            {!locked.includes(code) ? (
              <button
                type="button"
                className="erpLangChipX"
                aria-label={T("Убрать язык", "Remove language", "Xóa ngôn ngữ")}
                onClick={() => onRemove(code)}
              >
                ×
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {available.length ? (
        <div className={`erpLangAdd${open ? " open" : ""}`} ref={root}>
          <button
            type="button"
            className="erpBtn"
            data-testid="content-lang-add"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            + {T("Добавить язык", "Add language", "Thêm ngôn ngữ")}
          </button>
          {open ? (
            <div className="erpLangMenu" role="listbox">
              {available.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  onClick={() => {
                    onAdd(option.code);
                    setOpen(false);
                  }}
                >
                  {contentLangLabel(option.code, ui)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
