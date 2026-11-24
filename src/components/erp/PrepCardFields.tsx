"use client";

import { useRef, useState } from "react";
import { contentLangLabel, shownContentLangs } from "@/lib/erp/contentLang";
import type { RecipeStepDraft } from "@/lib/erp/recipeCard";
import {
  addLangToSteps,
  emptyRecipeStep,
  langsUsedInSteps,
  removeLangFromSteps,
} from "@/lib/erp/recipeCard";
import { ContentLangBar } from "./ContentLangBar";
import { ExtraNameFields } from "./ExtraNameFields";
import { erpLang } from "./i18n";
import { Field, T } from "./ui";

async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 2_500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/jpeg", 0.86),
  );
}

export async function uploadPrepPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", await downscaleImage(file), "photo.jpg");
  const response = await fetch("/api/erp/photo", { method: "POST", body: form });
  const data = (await response.json().catch(() => null)) as { url?: string } | null;
  if (!response.ok || typeof data?.url !== "string" || !data.url) {
    throw new Error("photo");
  }
  return data.url;
}

function PhotoField({
  url,
  disabled,
  small,
  cover,
  onChange,
}: {
  url: string;
  disabled: boolean;
  small?: boolean;
  cover?: boolean;
  onChange: (url: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file || disabled) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadPrepPhoto(file));
    } catch {
      setError(T("Не удалось загрузить фото", "Could not upload the photo", "Không tải được ảnh"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const openPicker = () => {
    if (disabled || busy) return;
    input.current?.click();
  };

  return (
    <div className={`erpPhotoField ${small ? "small" : ""} ${cover ? "cover" : ""}`}>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        disabled={disabled || busy}
        onChange={(event) => void pick(event.target.files?.[0])}
      />
      <button
        type="button"
        className="erpPhotoPreview"
        disabled={disabled || busy}
        onClick={openPicker}
        aria-label={T("Обложка", "Cover", "Ảnh bìa")}
      >
        {url ? <img src={url} alt="" /> : <span className="erpPhotoPlaceholder">{cover ? "📷" : "+"}</span>}
      </button>
      <div className="erpPhotoActs">
        {!disabled ? (
          <button
            type="button"
            className="erpBtn"
            disabled={busy}
            onClick={openPicker}
            data-testid={cover ? "prep-cover-add" : undefined}
          >
            {busy
              ? T("Загрузка…", "Uploading…", "Đang tải…")
              : url
                ? T("Заменить фото", "Replace photo", "Đổi ảnh")
                : T("Добавить фото", "Add photo", "Thêm ảnh")}
          </button>
        ) : null}
        {url && !disabled ? (
          <button type="button" className="erpBtn ghost" onClick={() => onChange("")}>
            {T("Убрать фото", "Remove photo", "Bỏ ảnh")}
          </button>
        ) : null}
      </div>
      {error ? <p className="erpHint warn">{error}</p> : null}
    </div>
  );
}

export function PrepCoverField({
  url,
  disabled,
  onChange,
}: {
  url: string;
  disabled?: boolean;
  onChange: (url: string) => void;
}) {
  return (
    <div className="erpField wide" data-testid="prep-cover">
      <span>{T("Обложка", "Cover", "Ảnh bìa")}</span>
      <PhotoField url={url} disabled={Boolean(disabled)} cover onChange={onChange} />
      <small>
        {T(
          "Картинка блюда в списке и карточке Recipes",
          "Dish photo on the Recipes list and card",
          "Ảnh món trên danh sách và thẻ Recipes",
        )}
      </small>
    </div>
  );
}

export type PrepCardKind = "sauce" | "prep";

export function PrepCardHeader({
  kind,
  nameEn,
  nameVn,
  names,
  cardNo,
  cardDate,
  photo,
  readOnly,
  onKind,
  onNameEn,
  onNameVn,
  onNames,
  onCardNo,
  onCardDate,
  onPhoto,
}: {
  kind: PrepCardKind;
  nameEn: string;
  nameVn: string;
  names: Record<string, string>;
  cardNo: string;
  cardDate: string;
  photo: string;
  readOnly: boolean;
  onKind: (value: PrepCardKind) => void;
  onNameEn: (value: string) => void;
  onNameVn: (value: string) => void;
  onNames: (value: Record<string, string>) => void;
  onCardNo: (value: string) => void;
  onCardDate: (value: string) => void;
  onPhoto: (value: string) => void;
}) {
  return (
    <div className="erpCard erpPrepHeader">
      <PrepCoverField url={photo} onChange={onPhoto} />
      <div className="erpGrid">
        <Field label={T("Вкладка", "Tab", "Mục")}>
          <select
            value={kind}
            disabled={readOnly}
            data-testid="prep-kind"
            onChange={(event) => onKind(event.target.value === "sauce" ? "sauce" : "prep")}
          >
            <option value="sauce">{T("Соусы", "Sauces", "Sốt")}</option>
            <option value="prep">{T("Полуфабрикаты", "Semi-finished", "Bán thành phẩm")}</option>
          </select>
        </Field>
      </div>
      <ExtraNameFields
        en={nameEn}
        vn={nameVn}
        names={names}
        onEn={onNameEn}
        onVn={onNameVn}
        onNames={onNames}
        enTestId="prep-name"
        vnTestId="prep-name-vn"
      />
      <div className="erpGrid two">
        <Field label={T("Карта №", "Card No.", "Số thẻ")}>
          <input value={cardNo} disabled={readOnly} maxLength={80} onChange={(event) => onCardNo(event.target.value)} />
        </Field>
        <Field label={T("Дата", "Date", "Ngày lập")}>
          <input type="date" value={cardDate} disabled={readOnly} onChange={(event) => onCardDate(event.target.value)} />
        </Field>
      </div>
    </div>
  );
}

export function PrepStepsEditor({
  steps,
  readOnly,
  onChange,
}: {
  steps: RecipeStepDraft[];
  readOnly: boolean;
  onChange: (steps: RecipeStepDraft[]) => void;
}) {
  const langs = shownContentLangs(langsUsedInSteps(steps));
  const ui = erpLang();
  const extraLangs = langs.filter((code) => code !== "en" && code !== "vn");
  const setStep = (index: number, patch: Partial<RecipeStepDraft>) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  const setExtra = (index: number, code: string, patch: Partial<{ title: string; items: string }>) => {
    const current = steps[index].extra?.[code] ?? { title: "", items: "" };
    setStep(index, { extra: { ...steps[index].extra, [code]: { ...current, ...patch } } });
  };

  return (
    <div className="erpPrepSteps">
      <h2>{T("Технология приготовления", "Cooking technology", "Quy trình chế biến")}</h2>
      {!readOnly ? (
        <ContentLangBar
          langs={langs}
          onAdd={(code) => onChange(addLangToSteps(steps.length ? steps : [emptyRecipeStep()], code))}
          onRemove={(code) => onChange(removeLangFromSteps(steps, code))}
        />
      ) : extraLangs.length ? (
        <p className="erpHint">
          {T("Языки", "Languages", "Ngôn ngữ")}: {langs.map((code) => contentLangLabel(code, ui)).join(" · ")}
        </p>
      ) : null}
      {steps.map((step, index) => (
        <section key={index} className="erpCard erpPrepStep">
          <div className="erpPrepStepHead">
            <span className="erpPrepStepNum">{index + 1}</span>
            <div className="erpGrid two">
              <Field label={`${T("Заголовок шага", "Step title", "Tiêu đề bước")} (${contentLangLabel("en", ui)})`}>
                <input
                  value={step.titleEn}
                  disabled={readOnly}
                  maxLength={200}
                  onChange={(event) => setStep(index, { titleEn: event.target.value })}
                />
              </Field>
              <Field label={`${T("Заголовок шага", "Step title", "Tiêu đề bước")} (${contentLangLabel("vn", ui)})`}>
                <input
                  value={step.titleVn}
                  disabled={readOnly}
                  maxLength={200}
                  onChange={(event) => setStep(index, { titleVn: event.target.value })}
                />
              </Field>
              {extraLangs.map((code) => (
                <Field
                  key={code}
                  label={`${T("Заголовок шага", "Step title", "Tiêu đề bước")} (${contentLangLabel(code, ui)})`}
                >
                  <input
                    value={step.extra?.[code]?.title ?? ""}
                    disabled={readOnly}
                    maxLength={200}
                    onChange={(event) => setExtra(index, code, { title: event.target.value })}
                  />
                </Field>
              ))}
            </div>
            {!readOnly ? (
              <button
                type="button"
                className="erpIconBtn"
                aria-label={T("Удалить шаг", "Remove step", "Xóa bước")}
                onClick={() => onChange(steps.filter((_, i) => i !== index))}
              >
                ×
              </button>
            ) : null}
          </div>
          <PhotoField url={step.photo} disabled={readOnly} small onChange={(photo) => setStep(index, { photo })} />
          <Field
            label={`${T("Пункты", "Lines", "Các dòng")} ${contentLangLabel("en", ui)} — ${T("каждый с новой строки", "one per row", "mỗi dòng một ý")}`}
          >
            <textarea
              rows={Math.max(3, step.itemsEn.split("\n").length + 1)}
              value={step.itemsEn}
              disabled={readOnly}
              onChange={(event) => setStep(index, { itemsEn: event.target.value })}
            />
          </Field>
          <Field
            label={`${T("Пункты", "Lines", "Các dòng")} ${contentLangLabel("vn", ui)} — ${T("каждый с новой строки", "one per row", "mỗi dòng một ý")}`}
          >
            <textarea
              rows={Math.max(3, step.itemsVn.split("\n").length + 1)}
              value={step.itemsVn}
              disabled={readOnly}
              onChange={(event) => setStep(index, { itemsVn: event.target.value })}
            />
          </Field>
          {extraLangs.map((code) => (
            <Field
              key={code}
              label={`${T("Пункты", "Lines", "Các dòng")} ${contentLangLabel(code, ui)} — ${T("каждый с новой строки", "one per row", "mỗi dòng một ý")}`}
            >
              <textarea
                rows={Math.max(3, (step.extra?.[code]?.items ?? "").split("\n").length + 1)}
                value={step.extra?.[code]?.items ?? ""}
                disabled={readOnly}
                onChange={(event) => setExtra(index, code, { items: event.target.value })}
              />
            </Field>
          ))}
        </section>
      ))}
      {!readOnly ? (
        <button type="button" className="erpBtn" onClick={() => onChange([...steps, emptyRecipeStep()])}>
          + {T("Добавить шаг", "Add step", "Thêm bước")}
        </button>
      ) : null}
      {!steps.length && readOnly ? (
        <p className="erpHint">{T("Шаги пока не заполнены", "No steps yet", "Chưa có bước")}</p>
      ) : null}
    </div>
  );
}
