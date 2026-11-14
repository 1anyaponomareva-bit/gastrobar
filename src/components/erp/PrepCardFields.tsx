"use client";

import { useRef, useState } from "react";
import type { RecipeStepDraft } from "@/lib/erp/recipeCard";
import { emptyRecipeStep } from "@/lib/erp/recipeCard";
import type { ErpUnit } from "@/lib/erp/costing";
import { Field, QtyInput, T } from "./ui";

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
  onChange,
}: {
  url: string;
  disabled: boolean;
  small?: boolean;
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

  return (
    <div className={`erpPhotoField ${small ? "small" : ""}`}>
      {url ? <img src={url} alt="" /> : null}
      <div className="erpPhotoActs">
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          disabled={disabled || busy}
          onChange={(event) => void pick(event.target.files?.[0])}
        />
        {!disabled ? (
          <button type="button" className="erpBtn" disabled={busy} onClick={() => input.current?.click()}>
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

export type PrepCardKind = "dish" | "prep";

export function PrepCardHeader({
  kind,
  nameEn,
  nameVn,
  cardNo,
  cardDate,
  photo,
  yieldQty,
  unit,
  readOnly,
  onKind,
  onNameEn,
  onNameVn,
  onCardNo,
  onCardDate,
  onPhoto,
  onYieldQty,
}: {
  kind: PrepCardKind;
  nameEn: string;
  nameVn: string;
  cardNo: string;
  cardDate: string;
  photo: string;
  yieldQty: number | null;
  unit: ErpUnit | null;
  readOnly: boolean;
  onKind: (value: PrepCardKind) => void;
  onNameEn: (value: string) => void;
  onNameVn: (value: string) => void;
  onCardNo: (value: string) => void;
  onCardDate: (value: string) => void;
  onPhoto: (value: string) => void;
  onYieldQty: (value: number | null) => void;
}) {
  return (
    <div className="erpCard erpPrepHeader">
      <div className="erpGrid">
        <Field label={T("Вкладка", "Tab", "Mục")}>
          <select
            value={kind}
            disabled={readOnly}
            data-testid="prep-kind"
            onChange={(event) => onKind(event.target.value === "dish" ? "dish" : "prep")}
          >
            <option value="dish">{T("Блюда", "Dishes", "Món ăn")}</option>
            <option value="prep">{T("Заготовки", "Preps", "Sơ chế")}</option>
          </select>
        </Field>
      </div>
      <div className="erpGrid two">
        <Field label={T("Название (English) *", "Name (English) *", "Tên (English) *")}>
          <input value={nameEn} onChange={(event) => onNameEn(event.target.value)} maxLength={200} data-testid="prep-name" />
        </Field>
        <Field label={T("Название (Tiếng Việt)", "Name (Tiếng Việt)", "Tên (Tiếng Việt)")}>
          <input value={nameVn} onChange={(event) => onNameVn(event.target.value)} maxLength={200} data-testid="prep-name-vn" />
        </Field>
      </div>
      <div className="erpGrid two">
        <Field label={T("Карта №", "Card No.", "Số thẻ")}>
          <input value={cardNo} disabled={readOnly} maxLength={80} onChange={(event) => onCardNo(event.target.value)} />
        </Field>
        <Field label={T("Дата", "Date", "Ngày lập")}>
          <input type="date" value={cardDate} disabled={readOnly} onChange={(event) => onCardDate(event.target.value)} />
        </Field>
      </div>
      <PhotoField url={photo} disabled={readOnly} onChange={onPhoto} />
      <div className="erpGrid">
        <Field
          label={T("Вес готового продукта (нормативный выход) *", "Finished yield weight *", "Trọng lượng thành phẩm (sản lượng chuẩn) *")}
          hint={T(
            "Сколько полуфабриката выходит после приготовления — тот же выход, что в составе.",
            "How much finished product you get after cooking — the same yield as in the composition.",
            "Lượng thành phẩm sau khi nấu — cùng sản lượng với phần thành phần.",
          )}
        >
          <QtyInput base={unit} value={yieldQty} disabled={readOnly} defaultSmall={unit !== "pcs"} onChange={onYieldQty} />
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
  const setStep = (index: number, patch: Partial<RecipeStepDraft>) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  return (
    <div className="erpPrepSteps">
      <h2>{T("Технология приготовления", "Cooking technology", "Quy trình chế biến")}</h2>
      {steps.map((step, index) => (
        <section key={index} className="erpCard erpPrepStep">
          <div className="erpPrepStepHead">
            <span className="erpPrepStepNum">{index + 1}</span>
            <div className="erpGrid two">
              <Field label={T("Заголовок шага (EN)", "Step title (EN)", "Tiêu đề bước (EN)")}>
                <input
                  value={step.titleEn}
                  disabled={readOnly}
                  maxLength={200}
                  onChange={(event) => setStep(index, { titleEn: event.target.value })}
                />
              </Field>
              <Field label={T("Заголовок шага (VN)", "Step title (VN)", "Tiêu đề bước (VN)")}>
                <input
                  value={step.titleVn}
                  disabled={readOnly}
                  maxLength={200}
                  onChange={(event) => setStep(index, { titleVn: event.target.value })}
                />
              </Field>
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
          <Field label={T("Пункты EN — каждый с новой строки", "EN lines — one per row", "Các dòng EN — mỗi dòng một ý")}>
            <textarea
              rows={Math.max(3, step.itemsEn.split("\n").length + 1)}
              value={step.itemsEn}
              disabled={readOnly}
              onChange={(event) => setStep(index, { itemsEn: event.target.value })}
            />
          </Field>
          <Field label={T("Пункты VN — каждый с новой строки", "VN lines — one per row", "Các dòng VN — mỗi dòng một ý")}>
            <textarea
              rows={Math.max(3, step.itemsVn.split("\n").length + 1)}
              value={step.itemsVn}
              disabled={readOnly}
              onChange={(event) => setStep(index, { itemsVn: event.target.value })}
            />
          </Field>
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
