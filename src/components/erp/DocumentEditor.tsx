"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildCostContext, costLine, productLabel } from "@/lib/erp/costing";
import type { ErpDocType, ErpDocument, ErpDocumentLine, ErpRecipe, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import {
  DOC_LABELS,
  errorText,
  Field,
  L,
  NumberInput,
  productById,
  ProductPicker,
  qtyText,
  QtyInput,
  STATUS_LABELS,
  stockQty,
  today,
  unitOf,
  vnd,
  WarehouseSelect,
} from "./ui";

const TYPES = new Set<ErpDocType>(["opening", "receipt", "transfer", "writeoff", "count", "production"]);

function defaultDocument(state: ErpState, type: ErpDocType, email: string): ErpDocument {
  const byKind = (kind: string) => state.warehouses.find((w) => w.kind === kind && !w.archived_at)?.id ?? null;
  const prep = byKind("prep_kitchen");
  return {
    doc_type: type,
    doc_date: today(),
    warehouse_id: type === "production" ? prep : type === "transfer" ? byKind("warehouse") : (byKind("warehouse") ?? prep),
    target_warehouse_id: type === "production" ? prep : type === "transfer" ? prep : null,
    responsible: type === "production" ? email : null,
    lines: [],
  };
}

export function DocumentEditor({ id }: { id: string }) {
  const { state, act, busy, email, notify } = useErp();
  const [doc, setDoc] = useState<ErpDocument | null>(null);

  const load = useCallback(async () => {
    if (id === "new") return;
    const response = await fetch(`/api/erp/documents/${id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return notify({ ok: false, text: errorText(data.error ?? "server") });
    setDoc(data.document);
  }, [id, notify]);

  useEffect(() => {
    if (!state) return;
    if (id === "new") {
      const type = new URLSearchParams(window.location.search).get("type") as ErpDocType;
      setDoc(defaultDocument(state, TYPES.has(type) ? type : "receipt", email));
    } else {
      void load();
    }
    // Only on first render: later state reloads must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, Boolean(state)]);

  if (!state || !doc) return <div className="erpEmpty">{L("Loading…", "Đang tải…")}</div>;

  const editable = !doc.status || doc.status === "draft";
  const set = <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => setDoc((prev) => (prev ? { ...prev, [key]: value } : prev));
  const setLines = (update: (lines: ErpDocumentLine[]) => ErpDocumentLine[]) =>
    setDoc((prev) => (prev ? { ...prev, lines: update(prev.lines) } : prev));

  const save = async (): Promise<string | null> => {
    const result = await act<{ id: string }>({ action: "saveDocument", document: { ...doc } as Record<string, unknown> });
    if (!result) return null;
    if (id === "new") {
      window.history.replaceState(null, "", `/erp/documents/${result.id}`);
    }
    const response = await fetch(`/api/erp/documents/${result.id}`, { cache: "no-store" });
    if (response.ok) setDoc((await response.json()).document);
    return result.id;
  };

  const post = async () => {
    const savedId = await save();
    if (!savedId) return;
    if (await act({ action: "postDocument", id: savedId })) {
      const response = await fetch(`/api/erp/documents/${savedId}`, { cache: "no-store" });
      if (response.ok) setDoc((await response.json()).document);
      notify({ ok: true, text: L("Posted", "Đã ghi sổ") });
    }
  };

  const cancel = async () => {
    const reason = window.prompt(L("Cancel reason", "Lý do hủy"));
    if (!reason?.trim() || !doc.id) return;
    if (await act({ action: "cancelDocument", id: doc.id, reason })) await load();
  };

  const remove = async () => {
    if (!doc.id || !window.confirm(L("Delete this draft?", "Xóa bản nháp?"))) return;
    if (await act({ action: "deleteDraft", id: doc.id })) window.location.href = "/erp/documents";
  };

  return (
    <>
      <h1>
        {DOC_LABELS[doc.doc_type]} {doc.doc_no ?? ""}{" "}
        <span className={`erpBadge ${doc.status === "posted" ? "ok" : doc.status === "cancelled" ? "bad" : ""}`}>
          {STATUS_LABELS[doc.status ?? "draft"]}
        </span>
      </h1>
      {doc.status === "cancelled" ? (
        <div className="erpNotice bad">
          {L("Cancelled", "Đã hủy")}: {doc.cancel_reason} · {doc.cancelled_by} · {doc.cancelled_at?.slice(0, 16).replace("T", " ")}
        </div>
      ) : null}

      <div className="erpCard">
        <Header state={state} doc={doc} editable={editable} set={set} />
      </div>

      {doc.doc_type === "production" ? (
        <Production state={state} doc={doc} editable={editable} set={set} setLines={setLines} />
      ) : (
        <Lines state={state} doc={doc} editable={editable} setLines={setLines} />
      )}

      <div className="erpActions">
        {editable ? (
          <>
            <button type="button" className="erpBtn" disabled={busy} onClick={save}>
              {L("Save draft", "Lưu nháp")}
            </button>
            <button type="button" className="erpBtn primary" disabled={busy || !doc.lines.length} onClick={post}>
              {L("Post", "Ghi sổ")}
            </button>
            {doc.id ? (
              <button type="button" className="erpBtn danger" disabled={busy} onClick={remove}>
                {L("Delete draft", "Xóa nháp")}
              </button>
            ) : null}
          </>
        ) : doc.status === "posted" ? (
          <button type="button" className="erpBtn danger" disabled={busy} onClick={cancel}>
            {L("Cancel document", "Hủy chứng từ")}
          </button>
        ) : null}
        <a className="erpBtn" href={doc.doc_type === "production" ? "/erp/production" : "/erp/documents"}>
          {L("Back", "Quay lại")}
        </a>
      </div>
      {editable ? (
        <p className="erpHint">
          {L(
            "A draft does not change stock. Posting checks availability and writes all movements at once.",
            "Bản nháp không thay đổi tồn kho. Ghi sổ kiểm tra tồn và ghi toàn bộ một lần.",
          )}
        </p>
      ) : (
        <p className="erpHint">
          {L("Posted by", "Ghi sổ bởi")} {doc.posted_by} · {doc.posted_at?.slice(0, 16).replace("T", " ")} · {L("created by", "tạo bởi")}{" "}
          {doc.created_by}
        </p>
      )}
    </>
  );
}

type SetDoc = <K extends keyof ErpDocument>(key: K, value: ErpDocument[K]) => void;
type SetLines = (update: (lines: ErpDocumentLine[]) => ErpDocumentLine[]) => void;

function Header({ state, doc, editable, set }: { state: ErpState; doc: ErpDocument; editable: boolean; set: SetDoc }) {
  const type = doc.doc_type;
  const twoWarehouses = type === "transfer" || type === "production";
  return (
    <div className="erpGrid">
      <Field label={L("Date", "Ngày")}>
        <input type="date" value={doc.doc_date ?? ""} disabled={!editable} onChange={(event) => set("doc_date", event.target.value)} />
      </Field>
      <Field label={twoWarehouses ? L("From warehouse", "Từ kho") : L("Warehouse", "Kho")}>
        <WarehouseSelect warehouses={state.warehouses} value={doc.warehouse_id} disabled={!editable} onChange={(v) => set("warehouse_id", v)} />
      </Field>
      {twoWarehouses ? (
        <Field label={type === "production" ? L("Output to", "Thành phẩm vào kho") : L("To warehouse", "Đến kho")}>
          <WarehouseSelect
            warehouses={state.warehouses}
            value={doc.target_warehouse_id}
            disabled={!editable}
            onChange={(v) => set("target_warehouse_id", v)}
          />
        </Field>
      ) : null}
      {type === "receipt" ? (
        <Field label={L("Supplier", "Nhà cung cấp")}>
          <select value={doc.supplier_id ?? ""} disabled={!editable} onChange={(event) => set("supplier_id", event.target.value || null)}>
            <option value="">—</option>
            {state.suppliers
              .filter((s) => !s.archived_at || s.id === doc.supplier_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      {type === "receipt" && state.settings.input_vat_enabled ? (
        <label className="erpCheck">
          <input
            type="checkbox"
            checked={Boolean(doc.prices_include_vat)}
            disabled={!editable}
            onChange={(event) => set("prices_include_vat", event.target.checked)}
          />
          {L("Prices include VAT", "Giá đã gồm VAT")}
        </label>
      ) : null}
      {type === "writeoff" ? (
        <Field label={L("Reason *", "Lý do *")}>
          <input value={doc.reason ?? ""} disabled={!editable} onChange={(event) => set("reason", event.target.value)} />
        </Field>
      ) : null}
      <Field label={L("Comment", "Ghi chú")} wide>
        <input value={doc.comment ?? ""} disabled={!editable} onChange={(event) => set("comment", event.target.value)} />
      </Field>
    </div>
  );
}

function Lines({ state, doc, editable, setLines }: { state: ErpState; doc: ErpDocument; editable: boolean; setLines: SetLines }) {
  const type = doc.doc_type;
  const priced = type === "receipt" || type === "opening";
  const vatOn = type === "receipt" && state.settings.input_vat_enabled;
  const posted = doc.status === "posted" || doc.status === "cancelled";
  const update = (index: number, patch: Partial<ErpDocumentLine>) =>
    setLines((lines) => lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  const total = doc.lines.reduce((sum, line) => sum + (line.unit_price ?? 0) * line.qty, 0);
  const missingPrice = priced && doc.lines.some((line) => line.unit_price === null || line.unit_price === undefined);

  return (
    <div className="erpCard">
      <div className="erpTableWrap">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{L("Product", "Sản phẩm")}</th>
              {type === "receipt" ? <th>{L("Pack", "Quy cách")}</th> : null}
              <th>{type === "count" ? L("Counted", "Thực tế") : type === "receipt" ? L("Accepted qty", "SL nhận") : L("Qty", "SL")}</th>
              {type === "transfer" || type === "writeoff" || (type === "count" && !posted) ? (
                <th className="num">{L("In stock", "Tồn")}</th>
              ) : null}
              {priced ? <th>{L("Price / unit, ₫", "Giá / ĐV")}</th> : null}
              {vatOn ? <th>VAT %</th> : null}
              {priced ? <th>{L("Expiry", "HSD")}</th> : null}
              {type === "writeoff" ? <th>{L("Reason", "Lý do")}</th> : null}
              {posted && type === "count" ? <th className="num">{L("System / diff", "Sổ / chênh")}</th> : null}
              {posted ? <th className="num">{L("Cost", "Giá vốn")}</th> : null}
              {editable ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, index) => {
              const unit = unitOf(state, line.product_id);
              const packs = state.packs.filter((pack) => pack.product_id === line.product_id);
              const pack = packs.find((p) => p.id === line.pack_id);
              return (
                <tr key={line.id ?? index}>
                  <td style={{ minWidth: 260 }}>
                    {editable ? (
                      <ProductPicker
                        state={state}
                        value={line.product_id}
                        onChange={(productId) => {
                          const product = productById(state, productId);
                          const defaultPack = state.packs.find((p) => p.product_id === productId && p.is_default);
                          update(index, {
                            product_id: productId,
                            pack_id: type === "receipt" ? (defaultPack?.id ?? null) : null,
                            unit_price: priced ? (product?.est_unit_cost ?? null) : null,
                          });
                        }}
                      />
                    ) : (
                      productLabel(productById(state, line.product_id) ?? { name_en: "?", name_vn: "" })
                    )}
                  </td>
                  {type === "receipt" ? (
                    <td style={{ minWidth: 170 }}>
                      {editable ? (
                        <div className="erpRow">
                          <select value={line.pack_id ?? ""} onChange={(event) => update(index, { pack_id: event.target.value || null })}>
                            <option value="">—</option>
                            {packs.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label} = {qtyText(p.qty_base, unit)}
                              </option>
                            ))}
                          </select>
                          {pack ? (
                            <NumberInput
                              value={line.pack_qty}
                              placeholder={L("packs", "số gói")}
                              onChange={(v) => update(index, { pack_qty: v, qty: v === null ? line.qty : v * pack.qty_base })}
                            />
                          ) : null}
                        </div>
                      ) : pack && line.pack_qty ? (
                        `${line.pack_qty} × ${pack.label}`
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                  <td style={{ minWidth: 150 }}>
                    {editable ? (
                      <QtyInput base={unit} value={line.qty} onChange={(v) => update(index, { qty: v ?? 0 })} />
                    ) : (
                      qtyText(line.qty, unit)
                    )}
                  </td>
                  {type === "transfer" || type === "writeoff" || (type === "count" && !posted) ? (
                    <td className="num">{qtyText(stockQty(state, line.product_id, doc.warehouse_id), unit)}</td>
                  ) : null}
                  {priced ? (
                    <td style={{ minWidth: 140 }}>
                      {editable ? (
                        <>
                          <NumberInput value={line.unit_price} onChange={(v) => update(index, { unit_price: v })} />
                          {pack ? (
                            <small className="erpHint">
                              {L("per pack", "mỗi gói")}: {line.unit_price !== null && line.unit_price !== undefined ? vnd(line.unit_price * pack.qty_base) : "—"}
                            </small>
                          ) : null}
                        </>
                      ) : (
                        vnd(line.unit_price)
                      )}
                    </td>
                  ) : null}
                  {vatOn ? (
                    <td style={{ width: 90 }}>
                      {editable ? (
                        <NumberInput
                          value={line.vat_rate}
                          placeholder={String(state.settings.default_input_vat_rate ?? "")}
                          onChange={(v) => update(index, { vat_rate: v })}
                        />
                      ) : (
                        (line.vat_rate ?? state.settings.default_input_vat_rate ?? "—")
                      )}
                    </td>
                  ) : null}
                  {priced ? (
                    <td>
                      <input
                        type="date"
                        value={line.expires_at ?? ""}
                        disabled={!editable}
                        onChange={(event) => update(index, { expires_at: event.target.value || null })}
                      />
                    </td>
                  ) : null}
                  {type === "writeoff" ? (
                    <td>
                      <input value={line.reason ?? ""} disabled={!editable} onChange={(event) => update(index, { reason: event.target.value })} />
                    </td>
                  ) : null}
                  {posted && type === "count" ? (
                    <td className="num">
                      {qtyText(line.system_qty, unit)} / {line.diff_qty !== null && line.diff_qty !== undefined && line.diff_qty > 0 ? "+" : ""}
                      {qtyText(line.diff_qty, unit)}
                    </td>
                  ) : null}
                  {posted ? (
                    <td className="num">
                      {line.cost_known === false ? <span className="erpBadge warn">{L("unknown", "chưa rõ")}</span> : vnd(line.cost_amount)}
                      {vatOn && line.vat_amount ? <small className="erpHint"> VAT {vnd(line.vat_amount)}</small> : null}
                    </td>
                  ) : null}
                  {editable ? (
                    <td>
                      <button type="button" className="erpLink" onClick={() => setLines((lines) => lines.filter((_, i) => i !== index))}>
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="erpActions">
          <button type="button" className="erpBtn" onClick={() => setLines((lines) => [...lines, { product_id: "", qty: 0 }])}>
            + {L("Line", "Dòng")}
          </button>
        </div>
      ) : null}
      {priced ? (
        <p className="erpHint">
          {L("Total", "Tổng")}: {vnd(total)}
          {missingPrice ? ` · ${L("lines without price will have unknown cost", "dòng chưa có giá sẽ có giá vốn chưa rõ")}` : ""}
          {vatOn ? ` · ${doc.prices_include_vat ? L("prices include VAT", "giá gồm VAT") : L("prices without VAT", "giá chưa VAT")}` : ""}
        </p>
      ) : null}
      {posted && doc.doc_type !== "count" ? (
        <p className="erpHint">
          {L("Document cost", "Giá vốn chứng từ")}: {doc.cost_known ? vnd(doc.total_cost) : L("incomplete (some costs unknown)", "chưa đủ (thiếu giá)")}
        </p>
      ) : null}
    </div>
  );
}

function Production({
  state,
  doc,
  editable,
  set,
  setLines,
}: {
  state: ErpState;
  doc: ErpDocument;
  editable: boolean;
  set: SetDoc;
  setLines: SetLines;
}) {
  const recipes = state.recipes.filter((r) => r.status === "active" || r.id === doc.recipe_id);
  const recipe = state.recipes.find((r) => r.id === doc.recipe_id);
  const output = productById(state, doc.output_product_id);
  const outUnit = output?.base_unit ?? null;
  const ctx = useMemo(() => buildCostContext(state.products, state.recipes), [state]);
  const posted = doc.status === "posted" || doc.status === "cancelled";

  const scaleLines = (r: ErpRecipe, plan: number | null): ErpDocumentLine[] =>
    r.lines
      .filter((line) => line.product_id && line.qty)
      .map((line) => {
        const planned = plan && r.yield_qty ? (line.qty! * plan) / r.yield_qty : line.qty!;
        return { product_id: line.product_id!, planned_qty: planned, qty: planned };
      });

  const chooseRecipe = (recipeId: string) => {
    const r = state.recipes.find((x) => x.id === recipeId);
    set("recipe_id", recipeId || null);
    if (!r) return;
    set("output_product_id", r.product_id);
    set("plan_output_qty", r.yield_qty);
    set("output_qty", r.yield_qty);
    set("output_pieces", r.yield_pieces);
    setLines(() => scaleLines(r, r.yield_qty));
  };

  const changePlan = (plan: number | null) => {
    set("plan_output_qty", plan);
    set("output_qty", plan);
    if (recipe) {
      if (plan && recipe.yield_pieces && recipe.yield_qty) set("output_pieces", Math.round((recipe.yield_pieces * plan) / recipe.yield_qty));
      setLines(() => scaleLines(recipe, plan));
    }
  };

  const plannedCost = doc.lines.reduce<number | null>((sum, line) => {
    if (sum === null || !line.product_id) return sum;
    const c = costLine(ctx, line.product_id, line.qty).cost;
    return c === null ? null : sum + c;
  }, 0);
  const actualCost = posted ? (doc.cost_known ? (doc.total_cost ?? null) : null) : plannedCost;
  const perUnit = actualCost !== null && doc.output_qty ? actualCost / doc.output_qty : null;
  const shelf = recipe?.shelf_life_days ?? output?.shelf_life_days ?? null;

  return (
    <>
      <div className="erpCard">
        <div className="erpGrid">
          <Field label={L("Recipe", "Công thức")}>
            <select value={doc.recipe_id ?? ""} disabled={!editable} onChange={(event) => chooseRecipe(event.target.value)}>
              <option value="">{L("— choose —", "— chọn —")}</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {productLabel(productById(state, r.product_id) ?? { name_en: "?", name_vn: "" })} · v{r.version}
                </option>
              ))}
            </select>
          </Field>
          <Field label={`${L("Planned output", "Sản lượng kế hoạch")} (${outUnit ?? "?"})`}>
            <QtyInput base={outUnit} value={doc.plan_output_qty} disabled={!editable} onChange={changePlan} />
          </Field>
          <Field label={`${L("Actual output *", "Thành phẩm thực tế *")} (${outUnit ?? "?"})`}>
            <QtyInput base={outUnit} value={doc.output_qty} disabled={!editable} onChange={(v) => set("output_qty", v)} />
          </Field>
          <Field label={L("Pieces", "Số cái")}>
            <NumberInput
              value={doc.output_pieces}
              disabled={!editable}
              onChange={(v) => set("output_pieces", v === null ? null : Math.round(v))}
            />
          </Field>
          <Field label={L("Total weight, kg", "Tổng trọng lượng, kg")}>
            <NumberInput value={doc.output_weight_kg} disabled={!editable} onChange={(v) => set("output_weight_kg", v)} />
          </Field>
          <Field label={L("Batch number", "Số lô")}>
            <input
              value={doc.batch_no ?? ""}
              placeholder={L("auto = document №", "tự động")}
              disabled={!editable}
              onChange={(event) => set("batch_no", event.target.value)}
            />
          </Field>
          <Field label={`${L("Expiry", "HSD")}${shelf ? ` (${L("auto", "tự động")} +${shelf} ${L("days", "ngày")})` : ""}`}>
            <input type="date" value={doc.expires_at ?? ""} disabled={!editable} onChange={(event) => set("expires_at", event.target.value || null)} />
          </Field>
          <Field label={L("Responsible", "Người phụ trách")}>
            <input value={doc.responsible ?? ""} disabled={!editable} onChange={(event) => set("responsible", event.target.value)} />
          </Field>
        </div>
      </div>

      <div className="erpCard">
        <h2 style={{ marginTop: 0 }}>{L("Components", "Nguyên liệu")}</h2>
        <div className="erpTableWrap">
          <table className="erpTable">
            <thead>
              <tr>
                <th>{L("Product", "Sản phẩm")}</th>
                <th className="num">{L("Planned", "Định mức")}</th>
                <th>{L("Actual use", "Thực tế")}</th>
                {!posted ? <th className="num">{L("In stock", "Tồn")}</th> : null}
                <th className="num">{posted ? L("Cost", "Giá vốn") : L("Estimate", "Ước tính")}</th>
                {editable ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, index) => {
                const unit = unitOf(state, line.product_id);
                const available = stockQty(state, line.product_id, doc.warehouse_id);
                const estimate = line.product_id ? costLine(ctx, line.product_id, line.qty).cost : null;
                return (
                  <tr key={line.id ?? index}>
                    <td style={{ minWidth: 240 }}>
                      {editable ? (
                        <ProductPicker
                          state={state}
                          value={line.product_id}
                          onChange={(productId) =>
                            setLines((lines) => lines.map((l, i) => (i === index ? { ...l, product_id: productId } : l)))
                          }
                        />
                      ) : (
                        productLabel(productById(state, line.product_id) ?? { name_en: "?", name_vn: "" })
                      )}
                    </td>
                    <td className="num">{qtyText(line.planned_qty ?? null, unit)}</td>
                    <td style={{ minWidth: 150 }}>
                      {editable ? (
                        <QtyInput
                          base={unit}
                          value={line.qty}
                          onChange={(v) => setLines((lines) => lines.map((l, i) => (i === index ? { ...l, qty: v ?? 0 } : l)))}
                        />
                      ) : (
                        qtyText(line.qty, unit)
                      )}
                    </td>
                    {!posted ? (
                      <td className="num">
                        {available < line.qty ? <span className="erpBadge bad">{qtyText(available, unit)}</span> : qtyText(available, unit)}
                      </td>
                    ) : null}
                    <td className="num">
                      {posted ? (
                        line.cost_known === false ? (
                          <span className="erpBadge warn">{L("unknown", "chưa rõ")}</span>
                        ) : (
                          vnd(line.cost_amount)
                        )
                      ) : estimate === null ? (
                        <span className="erpBadge warn">{L("no price", "chưa có giá")}</span>
                      ) : (
                        vnd(estimate)
                      )}
                    </td>
                    {editable ? (
                      <td>
                        <button type="button" className="erpLink" onClick={() => setLines((lines) => lines.filter((_, i) => i !== index))}>
                          ✕
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable ? (
          <div className="erpActions">
            <button type="button" className="erpBtn" onClick={() => setLines((lines) => [...lines, { product_id: "", qty: 0 }])}>
              + {L("Component", "Nguyên liệu")}
            </button>
          </div>
        ) : null}

        <div className="erpKpis">
          <div className="erpKpi">
            <span>{posted ? L("Batch cost (actual)", "Giá vốn mẻ (thực tế)") : L("Batch cost (estimate)", "Giá vốn mẻ (ước tính)")}</span>
            <strong>{actualCost === null ? L("incomplete", "chưa đủ") : vnd(actualCost)}</strong>
          </div>
          <div className="erpKpi">
            <span>
              {L("Cost per", "Giá vốn mỗi")} {outUnit ?? "?"}
            </span>
            <strong>{vnd(posted ? (doc.output_unit_cost ?? null) : perUnit)}</strong>
          </div>
          {doc.output_pieces && outUnit !== "pcs" ? (
            <div className="erpKpi">
              <span>{L("Cost per piece", "Giá vốn mỗi cái")}</span>
              <strong>{vnd(actualCost === null ? null : actualCost / doc.output_pieces)}</strong>
            </div>
          ) : null}
          {doc.output_weight_kg && outUnit !== "kg" ? (
            <div className="erpKpi">
              <span>{L("Cost per kg", "Giá vốn mỗi kg")}</span>
              <strong>{vnd(actualCost === null ? null : actualCost / doc.output_weight_kg)}</strong>
            </div>
          ) : null}
        </div>
        {!posted ? (
          <p className="erpHint">
            {L(
              "Estimate uses current prices. On posting, the actual cost of the used lots is carried to the batch.",
              "Ước tính theo giá hiện tại. Khi ghi sổ, giá vốn thực tế của các lô được chuyển vào mẻ.",
            )}
          </p>
        ) : null}
      </div>
    </>
  );
}
