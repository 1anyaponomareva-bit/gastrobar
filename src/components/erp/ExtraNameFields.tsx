"use client";

import { contentLangLabel, extraNamesOnly, shownContentLangs } from "@/lib/erp/contentLang";
import { ContentLangBar } from "./ContentLangBar";
import { erpLang } from "./i18n";
import { Field, T } from "./ui";

const LOCKED_LANGS = ["en", "vn", "ru"] as const;

export function ExtraNameFields({
  en,
  vn,
  names,
  onEn,
  onVn,
  onNames,
  requiredEn = true,
  readOnly = false,
  autoFocus = false,
  enTestId,
  vnTestId,
  hideBar = false,
  omitLocked = false,
}: {
  en: string;
  vn: string;
  names: Record<string, string> | undefined;
  onEn: (value: string) => void;
  onVn: (value: string) => void;
  onNames: (value: Record<string, string>) => void;
  requiredEn?: boolean;
  readOnly?: boolean;
  autoFocus?: boolean;
  enTestId?: string;
  vnTestId?: string;
  hideBar?: boolean;
  omitLocked?: boolean;
}) {
  const extra = extraNamesOnly(names);
  const langs = shownContentLangs([...Object.keys(extra), ...(omitLocked ? [] : ["ru"])]);
  const locked = omitLocked ? [] : [...LOCKED_LANGS];
  const extraLangs = langs.filter((code) => !locked.includes(code as (typeof LOCKED_LANGS)[number]));
  const ui = erpLang();
  const label = T("Название", "Name", "Tên");

  return (
    <div className="erpExtraNames">
      {!readOnly && !hideBar ? (
        <ContentLangBar
          langs={omitLocked ? extraLangs : langs}
          locked={locked}
          onAdd={(code) => onNames({ ...extra, [code]: extra[code] ?? "" })}
          onRemove={(code) => {
            const next = { ...extra };
            delete next[code];
            onNames(next);
          }}
        />
      ) : null}
      <div className="erpGrid two">
        {!omitLocked ? (
          <>
            <Field label={`${label} (${contentLangLabel("en", ui)})${requiredEn ? " *" : ""}`}>
              <input
                value={en}
                disabled={readOnly}
                onChange={(event) => onEn(event.target.value)}
                autoFocus={autoFocus}
                maxLength={200}
                data-testid={enTestId}
              />
            </Field>
            <Field label={`${label} (${contentLangLabel("vn", ui)})`}>
              <input
                value={vn}
                disabled={readOnly}
                onChange={(event) => onVn(event.target.value)}
                maxLength={200}
                data-testid={vnTestId}
              />
            </Field>
            <Field label={`${label} (${contentLangLabel("ru", ui)})`}>
              <input
                value={extra.ru ?? ""}
                disabled={readOnly}
                onChange={(event) => onNames({ ...extra, ru: event.target.value })}
                maxLength={200}
                data-testid="product-name-ru"
              />
            </Field>
          </>
        ) : null}
        {extraLangs.map((code) => (
          <Field key={code} label={`${label} (${contentLangLabel(code, ui)})`}>
            <input
              value={extra[code] ?? ""}
              disabled={readOnly}
              onChange={(event) => onNames({ ...extra, [code]: event.target.value })}
              maxLength={200}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}
