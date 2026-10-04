"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KITCHEN_ITEMS,
  KITCHEN_SECTIONS,
  KITCHEN_UI,
  kitchenText,
  type KitchenCheckItem,
  type KitchenLang,
  type KitchenShift,
} from "@/data/kitchenChecklist";
import { getAssetUrl } from "@/lib/appVersion";
import {
  deliverKitchenChecklistPdf,
  kitchenChecklistPdfFileName,
  makeKitchenChecklistPdf,
  preloadKitchenChecklistPdfFonts,
} from "@/lib/kitchenChecklistPdf";
import {
  formatKitchenDate,
  loadKitchenChecklist,
  saveKitchenCheck,
  saveKitchenEmployee,
  saveKitchenShift,
} from "@/lib/kitchenChecklistStorage";
import { POSTER_FOOD_LOGO_LIGHT } from "@/lib/poster/constants";
import { toCheckAppLang } from "@/lib/shiftChecklistI18n";
import { useTranslation } from "@/lib/useTranslation";
import "./kitchen-checklist.css";

const FLAG_SRC: Record<KitchenLang, string> = {
  ru: "/flags/ru.svg",
  en: "/flags/gb.svg",
  vn: "/flags/vn.svg",
};

export function KitchenChecklistApp() {
  const { lang, changeLang } = useTranslation();
  const uiLang = toCheckAppLang(lang) as KitchenLang;
  const t = useCallback((key: keyof typeof KITCHEN_UI) => kitchenText(KITCHEN_UI[key], uiLang), [uiLang]);

  const [ready, setReady] = useState(false);
  const [dateIso, setDateIso] = useState("");
  const [employee, setEmployee] = useState("");
  const [shift, setShift] = useState<KitchenShift>("day");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hintItem, setHintItem] = useState<KitchenCheckItem | null>(null);
  const [nameError, setNameError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  useEffect(() => {
    document.body.classList.add("staff-tool-body", "kitchen-check-body");
    return () => {
      document.body.classList.remove("staff-tool-body", "kitchen-check-body");
    };
  }, []);

  useEffect(() => {
    const stored = loadKitchenChecklist();
    setDateIso(stored.date);
    setEmployee(stored.employee);
    setShift(stored.shift);
    setChecked(stored.checked);
    setReady(true);
    preloadKitchenChecklistPdfFonts();
  }, []);

  const doneCount = useMemo(
    () => KITCHEN_ITEMS.filter((item) => checked[item.id]).length,
    [checked],
  );

  const toggleItem = (id: string) => {
    const next = !checked[id];
    setChecked((current) => ({ ...current, [id]: next }));
    saveKitchenCheck(id, next);
  };

  const onEmployee = (value: string) => {
    setEmployee(value);
    setNameError(false);
    saveKitchenEmployee(value);
  };

  const onShift = (value: KitchenShift) => {
    setShift(value);
    saveKitchenShift(value);
  };

  const createDocument = async () => {
    if (!employee.trim()) {
      setNameError(true);
      return;
    }
    setExporting(true);
    setExportError(false);
    try {
      const blob = await makeKitchenChecklistPdf({
        dateIso,
        employee,
        shift,
        checked,
      });
      await deliverKitchenChecklistPdf(blob, kitchenChecklistPdfFileName(dateIso, employee));
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  if (!ready) return <div className="kitchen-check" />;

  return (
    <div className="kitchen-check">
      <header className="kitchen-check__header">
        <div className="kitchen-check__header-inner">
          <img
            className="kitchen-check__logo"
            src={getAssetUrl(POSTER_FOOD_LOGO_LIGHT)}
            alt="GASTROFOOD"
            width={168}
            height={58}
            draggable={false}
          />
          <div className="kitchen-check__langs" role="group" aria-label={t("hint")}>
            {(["ru", "en", "vn"] as const).map((id) => (
              <button
                key={id}
                type="button"
                className={`kitchen-check__lang${uiLang === id ? " is-active" : ""}`}
                aria-pressed={uiLang === id}
                onClick={() => changeLang(id)}
              >
                <img src={getAssetUrl(FLAG_SRC[id])} alt="" width={34} height={22} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="kitchen-check__main">
        <h1 className="kitchen-check__title">{t("title")}</h1>

        <section className="kitchen-check__profile">
          <label className="kitchen-check__field">
            <span>{t("date")}</span>
            <div className="kitchen-check__date">{formatKitchenDate(dateIso)}</div>
          </label>
          <label className="kitchen-check__field">
            <span>{t("employee")}</span>
            <input
              className={`kitchen-check__input${nameError ? " is-error" : ""}`}
              value={employee}
              placeholder={t("employeePlaceholder")}
              autoComplete="name"
              onChange={(event) => onEmployee(event.target.value)}
            />
          </label>
          <div className="kitchen-check__field">
            <span>{t("shift")}</span>
            <div className="kitchen-check__shifts">
              <button
                type="button"
                className={`kitchen-check__shift${shift === "day" ? " is-active" : ""}`}
                onClick={() => onShift("day")}
              >
                {t("day")}
              </button>
              <button
                type="button"
                className={`kitchen-check__shift${shift === "evening" ? " is-active" : ""}`}
                onClick={() => onShift("evening")}
              >
                {t("evening")}
              </button>
            </div>
          </div>
        </section>

        {KITCHEN_SECTIONS.map((section) => (
          <section key={section.id}>
            <h2 className="kitchen-check__section">{kitchenText(section.title, uiLang)}</h2>
            {KITCHEN_ITEMS.filter((item) => item.sectionId === section.id).map((item) => {
              const isChecked = Boolean(checked[item.id]);
              return (
                <div key={item.id} className={`kitchen-check__row${isChecked ? " is-checked" : ""}`}>
                  <button
                    type="button"
                    className="kitchen-check__toggle"
                    onClick={() => toggleItem(item.id)}
                  >
                    <span className="kitchen-check__box" aria-hidden="true" />
                    <span className="kitchen-check__label">{kitchenText(item.label, uiLang)}</span>
                  </button>
                  {item.hint ? (
                    <button
                      type="button"
                      className="kitchen-check__info"
                      aria-label={t("infoLabel")}
                      onClick={() => setHintItem(item)}
                    >
                      i
                    </button>
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}

        <div className="kitchen-check__bar">
          <div className="kitchen-check__progress">
            {t("doneOf")}: {doneCount} / {KITCHEN_ITEMS.length}
          </div>
          {nameError ? <p className="kitchen-check__error">{t("needName")}</p> : null}
          {exportError ? <p className="kitchen-check__error">{t("pdfError")}</p> : null}
          <button
            type="button"
            className="kitchen-check__submit"
            disabled={exporting}
            onClick={() => void createDocument()}
          >
            {t("formDoc")}
          </button>
        </div>
      </main>

      {hintItem?.hint ? (
        <div className="kitchen-check__modal" onClick={() => setHintItem(null)}>
          <div
            className="kitchen-check__sheet"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{t("hint")}</h2>
            <p>{kitchenText(hintItem.hint, uiLang)}</p>
            <button type="button" onClick={() => setHintItem(null)}>
              {t("close")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
