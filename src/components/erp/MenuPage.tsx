"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  buildCostContext,
  channelResult,
  costLine,
  summarize,
  type ChannelResult,
  type CostContext,
  type CostLine,
} from "@/lib/erp/costing";
import type { ErpDish, ErpState } from "@/lib/erp/types";
import { useErp } from "./ErpShell";
import { Field, L, NumberInput, pct, ProductPicker, qtyText, QtyInput, unitOf, vnd } from "./ui";

type DishForm = {
  id?: string;
  name_en: string;
  name_vn: string;
  category_id: string;
  sale_price: number | null;
  vat_rate: number | null;
  note: string;
  lines: { product_id: string; qty: number | null }[];
  channel_prices: Record<string, number | null>;
};

const ISSUE_TEXT: Record<ChannelResult["issues"][number], string> = {
  no_price: L("no price", "chưa có giá bán"),
  no_vat_rate: L("no VAT rate", "chưa có VAT"),
  no_commission: L("commission not set", "chưa có hoa hồng"),
  incomplete_cost: L("cost incomplete", "giá vốn chưa đủ"),
};

function toForm(dish: ErpDish | null): DishForm {
  return {
    id: dish?.id,
    name_en: dish?.name_en ?? "",
    name_vn: dish?.name_vn ?? "",
    category_id: dish?.category_id ?? "",
    sale_price: dish?.sale_price ?? null,
    vat_rate: dish?.vat_rate ?? null,
    note: dish?.note ?? "",
    lines: (dish?.lines ?? []).map((line) => ({ product_id: line.product_id, qty: line.qty })),
    channel_prices: Object.fromEntries((dish?.channel_prices ?? []).map((p) => [p.channel_id, p.sale_price])),
  };
}

function calculate(state: ErpState, ctx: CostContext, form: DishForm) {
  const summary = summarize(form.lines.filter((l) => l.product_id && l.qty).map((l) => costLine(ctx, l.product_id, l.qty!)));
  const channels = state.channels
    .filter((c) => !c.archived_at)
    .map((c) =>
      channelResult(
        summary,
        { id: c.id, name: c.name, commission_pct: c.commission_pct, price: form.channel_prices[c.id] ?? form.sale_price },
        state.settings,
        form.vat_rate,
      ),
    );
  return { summary, channels };
}

export function MenuPage() {
  const { state } = useErp();
  const [editing, setEditing] = useState<ErpDish | "new" | null>(null);
  const [archived, setArchived] = useState(false);
  const ctx = useMemo(() => (state ? buildCostContext(state.products, state.recipes) : null), [state]);
  if (!state || !ctx) return null;

  if (editing) {
    const dish = editing === "new" ? null : (state.dishes.find((d) => d.id === editing.id) ?? editing);
    return <DishEditor key={dish?.id ?? "new"} state={state} ctx={ctx} dish={dish} onClose={() => setEditing(null)} />;
  }

  const dishes = state.dishes.filter((d) => Boolean(d.archived_at) === archived);
  const directId = state.channels.find((c) => c.code === "direct")?.id;
  return (
    <>
      <h1>{L("Menu costing", "Giá vốn món")}</h1>
      <p className="erpHint">
        {L(
          "Internal dish cards for costing only. Nothing is written off from stock and the public menu is not changed.",
          "Chỉ dùng để tính giá vốn. Không trừ kho, không đổi menu công khai.",
        )}
      </p>
      <div className="erpToolbar">
        <button type="button" className="erpBtn primary" onClick={() => setEditing("new")}>
          + {L("Dish", "Món")}
        </button>
        <label className="erpCheck">
          <input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
          {L("Archive", "Lưu trữ")}
        </label>
      </div>
      <div className="erpTableWrap">
        <table className="erpTable">
          <thead>
            <tr>
              <th>{L("Dish", "Món")}</th>
              <th className="num">{L("Price", "Giá bán")}</th>
              <th className="num">{L("Food cost", "Giá vốn món")}</th>
              <th className="num">{L("Packaging", "Bao bì")}</th>
              <th className="num">Food cost %</th>
              <th className="num">{L("Gross margin", "Biên LN gộp")}</th>
            </tr>
          </thead>
          <tbody>
            {dishes.map((dish) => {
              const { summary, channels } = calculate(state, ctx, toForm(dish));
              const direct = channels.find((c) => c.id === directId) ?? channels[0];
              return (
                <tr key={dish.id} className="clickable" onClick={() => setEditing(dish)}>
                  <td>
                    {dish.name_en}
                    {dish.name_vn ? ` / ${dish.name_vn}` : ""}
                    {!summary.complete ? (
                      <>
                        {" "}
                        <span className="erpBadge warn">{L("incomplete", "chưa đủ")}</span>
                      </>
                    ) : null}
                  </td>
                  <td className="num">{vnd(dish.sale_price)}</td>
                  <td className="num">{vnd(summary.foodCost)}</td>
                  <td className="num">{vnd(summary.packagingCost)}</td>
                  <td className="num">{pct(direct?.foodCostPct)}</td>
                  <td className="num">{pct(direct?.grossMarginPct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!dishes.length ? <div className="erpEmpty">{L("No dishes yet", "Chưa có món")}</div> : null}
    </>
  );
}

function DishEditor({ state, ctx, dish, onClose }: { state: ErpState; ctx: CostContext; dish: ErpDish | null; onClose: () => void }) {
  const { act, busy } = useErp();
  const [form, setForm] = useState<DishForm>(() => toForm(dish));
  const [open, setOpen] = useState<Set<number>>(new Set());
  const set = <K extends keyof DishForm>(key: K, value: DishForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));
  const { summary, channels } = calculate(state, ctx, form);

  const save = async () => {
    const result = await act<{ id: string }>({
      action: "saveDish",
      dish: {
        ...form,
        lines: form.lines.filter((l) => l.product_id && l.qty),
        channel_prices: Object.entries(form.channel_prices).map(([channel_id, sale_price]) => ({ channel_id, sale_price })),
      },
    });
    if (result) setForm((prev) => ({ ...prev, id: result.id }));
  };

  const costRows = (line: CostLine, depth: number, key: string): ReactNode => (
    <Fragment key={key}>
      <tr className="child">
        <td style={{ paddingLeft: 10 + depth * 18 }}>↳ {line.name}</td>
        <td className="num">{qtyText(line.qty, line.unit)}</td>
        <td className="num">{line.unitCost === null ? "—" : vnd(line.unitCost)}</td>
        <td className="num">{line.cost === null ? <span className="erpBadge warn">{L("no price", "chưa có giá")}</span> : vnd(line.cost)}</td>
        <td />
      </tr>
      {line.children?.map((child, i) => costRows(child, depth + 1, `${key}-${i}`))}
    </Fragment>
  );

  return (
    <>
      <h1>{form.name_en || L("New dish", "Món mới")}</h1>
      <div className="erpCard">
        <div className="erpGrid">
          <Field label={L("Name EN *", "Tên EN *")}>
            <input value={form.name_en} onChange={(event) => set("name_en", event.target.value)} />
          </Field>
          <Field label={L("Name VN", "Tên VN")}>
            <input value={form.name_vn} onChange={(event) => set("name_vn", event.target.value)} />
          </Field>
          <Field label={L("Category", "Nhóm")}>
            <select value={form.category_id} onChange={(event) => set("category_id", event.target.value)}>
              <option value="">—</option>
              {state.categories
                .filter((c) => !c.archived_at || c.id === form.category_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name_en}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={L("Menu price, ₫", "Giá bán, ₫")}>
            <NumberInput value={form.sale_price} onChange={(v) => set("sale_price", v)} />
          </Field>
          {state.settings.output_vat_enabled ? (
            <Field label={`VAT % (${L("default", "mặc định")} ${state.settings.default_output_vat_rate ?? "—"})`}>
              <NumberInput value={form.vat_rate} onChange={(v) => set("vat_rate", v)} />
            </Field>
          ) : null}
        </div>
      </div>

      <div className="erpCard">
        <h2 style={{ marginTop: 0 }}>{L("Per portion", "Mỗi phần")}</h2>
        <div className="erpTableWrap">
          <table className="erpTable">
            <thead>
              <tr>
                <th>{L("Component", "Thành phần")}</th>
                <th className="num">{L("Qty", "SL")}</th>
                <th className="num">{L("Cost / unit", "Giá vốn / ĐV")}</th>
                <th className="num">{L("Line cost", "Thành tiền")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, index) => {
                const unit = unitOf(state, line.product_id);
                const cost = line.product_id && line.qty ? costLine(ctx, line.product_id, line.qty) : null;
                const expanded = open.has(index);
                return (
                  <Fragment key={index}>
                    <tr>
                      <td style={{ minWidth: 260 }}>
                        <ProductPicker
                          state={state}
                          value={line.product_id}
                          onChange={(productId) => set("lines", form.lines.map((l, i) => (i === index ? { ...l, product_id: productId } : l)))}
                        />
                        {cost?.children ? (
                          <button
                            type="button"
                            className="erpLink"
                            onClick={() =>
                              setOpen((prev) => {
                                const next = new Set(prev);
                                if (next.has(index)) next.delete(index);
                                else next.add(index);
                                return next;
                              })
                            }
                          >
                            {expanded ? L("hide composition", "ẩn thành phần") : L("show composition", "xem thành phần")}
                          </button>
                        ) : null}
                        {cost?.packaging ? <span className="erpBadge">{L("packaging", "bao bì")}</span> : null}
                      </td>
                      <td style={{ minWidth: 150 }}>
                        <QtyInput
                          base={unit}
                          value={line.qty}
                          defaultSmall={unit !== "pcs"}
                          onChange={(v) => set("lines", form.lines.map((l, i) => (i === index ? { ...l, qty: v } : l)))}
                        />
                      </td>
                      <td className="num">{cost?.unitCost === null || !cost ? "—" : vnd(cost.unitCost)}</td>
                      <td className="num">
                        {!cost ? "—" : cost.cost === null ? <span className="erpBadge warn">{L("no price", "chưa có giá")}</span> : vnd(cost.cost)}
                      </td>
                      <td>
                        <button type="button" className="erpLink" onClick={() => set("lines", form.lines.filter((_, i) => i !== index))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                    {expanded && cost?.children ? cost.children.map((child, i) => costRows(child, 1, `${index}-${i}`)) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="erpActions">
          <button type="button" className="erpBtn" onClick={() => set("lines", [...form.lines, { product_id: "", qty: null }])}>
            + {L("Component", "Thành phần")}
          </button>
        </div>

        <div className="erpKpis">
          <div className="erpKpi">
            <span>{L("Food cost", "Giá vốn thực phẩm")}</span>
            <strong>{summary.foodCost === null ? `≥ ${vnd(summary.knownFood)}` : vnd(summary.foodCost)}</strong>
          </div>
          <div className="erpKpi">
            <span>{L("Packaging", "Bao bì")}</span>
            <strong>{summary.packagingCost === null ? `≥ ${vnd(summary.knownPackaging)}` : vnd(summary.packagingCost)}</strong>
          </div>
          <div className="erpKpi">
            <span>{L("Total cost", "Tổng giá vốn")}</span>
            <strong>{summary.totalCost === null ? L("incomplete", "chưa đủ") : vnd(summary.totalCost)}</strong>
          </div>
        </div>
        {summary.missing.length ? (
          <div className="erpNotice warn">
            {L("No price for", "Chưa có giá")}: {summary.missing.join(", ")}
          </div>
        ) : null}
      </div>

      <div className="erpCard">
        <h2 style={{ marginTop: 0 }}>{L("Sales channels", "Kênh bán")}</h2>
        <div className="erpTableWrap">
          <table className="erpTable">
            <thead>
              <tr>
                <th>{L("Channel", "Kênh")}</th>
                <th>{L("Price, ₫", "Giá, ₫")}</th>
                {state.settings.output_vat_enabled ? <th className="num">{L("Output VAT", "VAT đầu ra")}</th> : null}
                <th className="num">{L("Net revenue", "Doanh thu thuần")}</th>
                <th className="num">{L("Commission", "Hoa hồng")}</th>
                <th className="num">Food cost %</th>
                <th className="num">{L("Cost % incl. packaging", "% giá vốn gồm bao bì")}</th>
                <th className="num">{L("Gross profit", "Lợi nhuận gộp")}</th>
                <th className="num">{L("Gross margin", "Biên LN gộp")}</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((channel) => (
                <tr key={channel.id}>
                  <td>
                    {channel.name}
                    {channel.issues.length ? <div className="erpHint">{channel.issues.map((issue) => ISSUE_TEXT[issue]).join(", ")}</div> : null}
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <NumberInput
                      value={form.channel_prices[channel.id] ?? null}
                      placeholder={form.sale_price === null ? "" : String(form.sale_price)}
                      onChange={(v) => set("channel_prices", { ...form.channel_prices, [channel.id]: v })}
                    />
                  </td>
                  {state.settings.output_vat_enabled ? <td className="num">{vnd(channel.vat)}</td> : null}
                  <td className="num">{vnd(channel.netRevenue)}</td>
                  <td className="num">
                    {vnd(channel.commission)} {channel.commissionPct !== null ? `(${channel.commissionPct}%)` : ""}
                  </td>
                  <td className="num">{pct(channel.foodCostPct)}</td>
                  <td className="num">{pct(channel.totalCostPct)}</td>
                  <td className="num">{vnd(channel.grossProfit)}</td>
                  <td className="num">{pct(channel.grossMarginPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="erpHint">
          {L(
            "Net revenue = price − output VAT (when enabled). Commission = price × platform %. Gross profit = net revenue − commission − food − packaging. Percentages are of net revenue. Empty channel price = menu price.",
            "Doanh thu thuần = giá − VAT đầu ra. Hoa hồng = giá × %. Lợi nhuận gộp = doanh thu thuần − hoa hồng − giá vốn − bao bì.",
          )}
        </p>
      </div>

      <div className="erpActions">
        <button type="button" className="erpBtn primary" disabled={busy || !form.name_en.trim()} onClick={save}>
          {L("Save", "Lưu")}
        </button>
        <button type="button" className="erpBtn" onClick={onClose}>
          {L("Back", "Quay lại")}
        </button>
        {dish ? (
          <button
            type="button"
            className="erpBtn danger"
            disabled={busy}
            onClick={async () => {
              if (await act({ action: "setArchived", entity: "dish", id: dish.id, archived: !dish.archived_at })) onClose();
            }}
          >
            {dish.archived_at ? L("Restore", "Khôi phục") : L("Archive", "Lưu trữ")}
          </button>
        ) : null}
      </div>
    </>
  );
}
