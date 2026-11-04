"use client";

import { useState } from "react";
import type { ErpChannel, ErpSettings } from "@/lib/erp/types";
import { RefList } from "./CatalogPage";
import { useErp } from "./ErpShell";
import { Field, L, NumberInput } from "./ui";

export function SettingsPage() {
  const { state, act, busy } = useErp();
  const [form, setForm] = useState<ErpSettings | null>(state?.settings ?? null);
  if (!state || !form) return null;
  const set = <K extends keyof ErpSettings>(key: K, value: ErpSettings[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <>
      <h1>{L("Settings", "Cài đặt")}</h1>
      <div className="erpCard">
        <h2 style={{ marginTop: 0 }}>VAT</h2>
        <div className="erpGrid">
          <label className="erpCheck">
            <input type="checkbox" checked={form.input_vat_enabled} onChange={(event) => set("input_vat_enabled", event.target.checked)} />
            {L("Input VAT on purchases", "VAT đầu vào khi mua hàng")}
          </label>
          <Field label={L("Default input VAT %", "VAT đầu vào mặc định %")}>
            <NumberInput value={form.default_input_vat_rate} onChange={(v) => set("default_input_vat_rate", v)} />
          </Field>
          <label className="erpCheck">
            <input type="checkbox" checked={form.output_vat_enabled} onChange={(event) => set("output_vat_enabled", event.target.checked)} />
            {L("Output VAT on sales", "VAT đầu ra khi bán")}
          </label>
          <Field label={L("Default output VAT %", "VAT đầu ra mặc định %")}>
            <NumberInput value={form.default_output_vat_rate} onChange={(v) => set("default_output_vat_rate", v)} />
          </Field>
        </div>
        <p className="erpHint">
          {L(
            "Input VAT on: receipts record VAT separately and stock cost is the price without VAT. Off: stock cost is the amount paid. Output VAT on: menu prices include VAT and margins are calculated from the price without VAT. Changing settings never recalculates posted documents.",
            "Bật VAT đầu vào: giá vốn không gồm VAT. Bật VAT đầu ra: giá menu gồm VAT, biên lợi nhuận tính trên giá chưa VAT. Chứng từ đã ghi sổ không bị tính lại.",
          )}
        </p>
        <div className="erpActions">
          <button type="button" className="erpBtn primary" disabled={busy} onClick={() => act({ action: "saveSettings", settings: form })}>
            {L("Save", "Lưu")}
          </button>
        </div>
      </div>

      <h2>{L("Sales channels and commission", "Kênh bán và hoa hồng")}</h2>
      <p className="erpHint">
        {L("Commission is the platform share of the menu price (Grab Food, Shopee Food…). Empty = not set, the calculation is marked incomplete.", "Hoa hồng là % trên giá bán. Để trống = chưa đặt.")}
      </p>
      <RefList<ErpChannel>
        entity="channel"
        rows={state.channels}
        columns={[
          { key: "name", label: L("Channel", "Kênh") },
          { key: "commission_pct", label: L("Commission %", "Hoa hồng %"), kind: "number" },
        ]}
      />
    </>
  );
}
