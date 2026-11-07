"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AdminAuthForm } from "@/components/recipes/AdminAuthForm";
import { translate } from "@/lib/i18n";
import { archiveAdmin, getAdminCatalog, reorderAdminProducts, reorderAdminSuppliers, saveAdminProduct, saveAdminSupplier } from "@/lib/orders/api";
import { defaultPackId, reorderSubset, sortCatalogProducts } from "@/lib/orders/orderList";
import { ordersT } from "@/lib/orders/i18n";
import type { OrderProduct, OrderSupplier } from "@/lib/orders/types";
import { useDragReorder } from "@/lib/useDragReorder";
import "@/components/staff/staff-inventory.css";
import "@/components/recipes/recipes.css";
import "@/components/staff/staff-admin.css";

const tAdmin = (key: string) => translate("ru", key);
const t = (key: string) => ordersT("ru", key);
const UNITS = ["kg", "l", "pcs"];

type Tab = "items" | "suppliers";
type Notice = { ok: boolean; text: string } | null;

function DragList<T extends { id: string }>({
  list,
  disabled,
  render,
  onCommit,
}: {
  list: T[];
  disabled: boolean;
  render: (entry: T) => ReactNode;
  onCommit: (ids: string[]) => Promise<boolean>;
}) {
  const listKey = list.map((entry) => entry.id).join("|");
  const [order, setOrder] = useState(() => list.map((entry) => entry.id));
  const orderRef = useRef(order);
  const moved = useRef(false);

  const resetOrder = useCallback(() => {
    orderRef.current = listKey ? listKey.split("|") : [];
    setOrder(orderRef.current);
  }, [listKey]);

  useEffect(resetOrder, [resetOrder]);

  const drag = useDragReorder(
    (from, to) => {
      const next = [...orderRef.current];
      const [entry] = next.splice(from, 1);
      next.splice(to, 0, entry);
      orderRef.current = next;
      moved.current = true;
      setOrder(next);
    },
    {
      onEnd: () => {
        if (moved.current) {
          void onCommit(orderRef.current).then((saved) => {
            if (!saved) resetOrder();
          });
        }
        moved.current = false;
      },
    },
  );

  const byId = new Map(list.map((entry) => [entry.id, entry]));
  return (
    <>
      {order.map((id, index) => {
        const entry = byId.get(id);
        if (!entry) return null;
        return (
          <div
            key={id}
            ref={(element) => {
              drag.rowRefs.current[index] = element;
            }}
            className={`staffAdminDragRow ${drag.dragIndex === index ? "dragging" : ""}`}
          >
            <button type="button" className="staffAdminHandle" aria-label="Перетащить" disabled={disabled} {...drag.handleProps(index)}>
              ⠿
            </button>
            {render(entry)}
          </div>
        );
      })}
    </>
  );
}

export function OrdersAdminApp() {
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [invite, setInvite] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("invite");
    if (code) {
      setInvite(code);
      setMode("register");
    }
    fetch("/api/recipes-admin/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { email?: string | null }) => setSession(data.email ?? null))
      .catch(() => setSession(null));
  }, []);

  const logout = async () => {
    await fetch("/api/recipes-admin/logout", { method: "POST" }).catch(() => {});
    setSession(null);
    setMode("login");
  };

  return (
    <div className="staff-inventory staff-inventory-page recipes-app staff-admin">
      <div className="app">
        <div className="top">
          <div className="langRow staffTopRow">
            <a className="staffAdminEntry" href="/orders">
              ← Order List
            </a>
          </div>
          <div className="recipesTitle">{t("admin_title")}</div>
        </div>
        <div className="main">
          {session === undefined ? (
            <div className="empty">{tAdmin("staff_loading")}</div>
          ) : session ? (
            <CatalogEditor email={session} onLogout={logout} onExpired={() => setSession(null)} />
          ) : (
            <AdminAuthForm
              mode={mode}
              invite={invite}
              t={tAdmin}
              onDone={setSession}
              onSwitchToLogin={() => setMode("login")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function CatalogEditor({ email, onLogout, onExpired }: { email: string; onLogout: () => void; onExpired: () => void }) {
  const [products, setProducts] = useState<OrderProduct[]>([]);
  const [suppliers, setSuppliers] = useState<OrderSupplier[]>([]);
  const [tab, setTab] = useState<Tab>("items");
  const [editingProduct, setEditingProduct] = useState<OrderProduct | "new" | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<OrderSupplier | "new" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const catalog = await getAdminCatalog();
    setProducts(sortCatalogProducts(catalog.products.map((row) => ({ ...row, sort: row.sort ?? 0 }))));
    setSuppliers(catalog.suppliers);
  }, []);

  useEffect(() => {
    load().catch(() => setNotice({ ok: false, text: tAdmin("recipes_admin_err_server") }));
  }, [load]);

  const guard = async (work: () => Promise<void>, okText: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await work();
      setNotice({ ok: true, text: okText });
      return true;
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error ? Number((error as { status?: number }).status) : 0;
      if (status === 401) {
        onExpired();
        return false;
      }
      setNotice({ ok: false, text: tAdmin("recipes_admin_err_server") });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const commitProductOrder = (ids: string[]) =>
    guard(async () => {
      const next = reorderSubset(
        products.map((row) => row.id),
        ids,
      );
      setProducts(await reorderAdminProducts(next));
    }, t("admin_saved"));

  const commitSupplierOrder = (ids: string[]) =>
    guard(async () => {
      const next = reorderSubset(
        suppliers.map((row) => row.id),
        ids,
      );
      setSuppliers(await reorderAdminSuppliers(next));
    }, t("admin_saved"));

  const visible = products.filter((product) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [product.nameEn, product.nameVn, product.brand ?? "", product.itemNo ?? ""].some((text) => text.toLowerCase().includes(query));
  });

  let body: ReactNode;
  if (editingProduct) {
    const initial = editingProduct === "new" ? null : editingProduct;
    body = (
      <ItemForm
        initial={initial}
        suppliers={suppliers}
        busy={busy}
        onCancel={() => setEditingProduct(null)}
        onSave={async (payload, isNew) => {
          const ok = await guard(async () => {
            await saveAdminProduct(payload);
            await load();
          }, isNew ? t("admin_item_added") : t("admin_item_saved"));
          if (ok) setEditingProduct(null);
        }}
        onArchive={
          initial
            ? async () => {
                const ok = await guard(async () => {
                  await archiveAdmin("product", initial.id, true);
                  await load();
                }, t("admin_item_saved"));
                if (ok) setEditingProduct(null);
              }
            : undefined
        }
      />
    );
  } else if (editingSupplier) {
    const initial = editingSupplier === "new" ? null : editingSupplier;
    body = (
      <SupplierForm
        initial={initial}
        busy={busy}
        onCancel={() => setEditingSupplier(null)}
        onSave={async (payload, isNew) => {
          const ok = await guard(async () => {
            await saveAdminSupplier(payload);
            await load();
          }, isNew ? t("admin_supplier_added") : t("admin_supplier_saved"));
          if (ok) setEditingSupplier(null);
        }}
        onArchive={
          initial
            ? async () => {
                const ok = await guard(async () => {
                  await archiveAdmin("supplier", initial.id, true);
                  await load();
                }, t("admin_supplier_saved"));
                if (ok) setEditingSupplier(null);
              }
            : undefined
        }
      />
    );
  } else if (tab === "items") {
    body = (
      <>
        <button type="button" className="dark staffAdminAdd" onClick={() => setEditingProduct("new")}>
          {t("admin_add_item")}
        </button>
        <input className="search" placeholder="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="mode">
          <span>{t("admin_order_hint")}</span>
        </div>
        <DragList
          list={visible}
          disabled={busy}
          onCommit={commitProductOrder}
          render={(product) => (
            <button type="button" className={`staffAdminRow ${product.hidden ? "isHidden" : ""}`} onClick={() => setEditingProduct(product)}>
              <b>
                {product.nameEn}
                {product.nameVn && product.nameVn !== product.nameEn ? ` / ${product.nameVn}` : ""}
              </b>
              <span>
                {[
                  suppliers.find((row) => row.id === product.supplierId)?.name,
                  product.unit,
                  product.hidden ? t("admin_hidden") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          )}
        />
        {!visible.length ? <div className="empty">Ничего не найдено</div> : null}
      </>
    );
  } else {
    body = (
      <>
        <button type="button" className="dark staffAdminAdd" onClick={() => setEditingSupplier("new")}>
          {t("admin_add_supplier")}
        </button>
        <div className="mode">
          <span>{t("admin_order_hint")}</span>
        </div>
        <DragList
          list={suppliers}
          disabled={busy}
          onCommit={commitSupplierOrder}
          render={(supplier) => (
            <button type="button" className="staffAdminRow" onClick={() => setEditingSupplier(supplier)}>
              <b>{supplier.name}</b>
              <span>
                {supplier.productCount} поз.
                {supplier.zaloUrl ? " · Zalo ✓" : ""}
              </span>
            </button>
          )}
        />
      </>
    );
  }

  return (
    <div className="adminEditor">
      <div className="adminBar">
        <span>{email}</span>
        <button type="button" className="white" onClick={onLogout}>
          {tAdmin("recipes_admin_logout")}
        </button>
      </div>
      {editingProduct || editingSupplier ? null : (
        <div className="sectionPicker staffAdminTabs" role="tablist" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {(
            [
              ["items", t("admin_items")],
              ["suppliers", t("admin_suppliers")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`sectionBtn ${tab === id ? "active" : ""}`}
              onClick={() => {
                setTab(id);
                setNotice(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {notice ? <div className={notice.ok ? "adminOk" : "adminError"}>{notice.text}</div> : null}
      {body}
    </div>
  );
}

function ItemForm({
  initial,
  suppliers,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  initial: OrderProduct | null;
  suppliers: OrderSupplier[];
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>, isNew: boolean) => void;
  onArchive?: () => void;
}) {
  const defaultPack = initial ? initial.packs.find((pack) => pack.pack_id === defaultPackId(initial)) ?? initial.packs[0] : null;
  const [name, setName] = useState(initial?.nameEn ?? "");
  const [nameVn, setNameVn] = useState(initial?.nameVn ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [unit, setUnit] = useState(initial?.unit || "kg");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? suppliers[0]?.id ?? "");
  const [packLabel, setPackLabel] = useState(defaultPack?.label ?? "");
  const [packQty, setPackQty] = useState(String(defaultPack?.qty_base || 1));
  const [packCode, setPackCode] = useState(defaultPack?.code ?? "");
  const [itemNo, setItemNo] = useState(initial?.itemNo ?? "");
  const [hidden, setHidden] = useState(Boolean(initial?.hidden));
  const canSave = Boolean(name.trim() && unit && supplierId && packLabel.trim() && Number(packQty) > 0);

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave) return;
        const pack = {
          id: defaultPack?.id,
          pack_id: defaultPack?.pack_id,
          label: packLabel.trim(),
          qty_base: Number(packQty),
          is_default: true,
          supplier_id: supplierId,
          code: packCode.trim(),
        };
        const otherPacks = (initial?.packs ?? [])
          .filter((row) => row.id !== defaultPack?.id)
          .map((row) => ({
            id: row.id,
            pack_id: row.pack_id,
            label: row.label,
            qty_base: row.qty_base,
            is_default: false,
            supplier_id: row.supplierId,
            code: row.code ?? "",
          }));
        onSave(
          {
            id: initial?.id,
            type: "ingredient",
            name_en: name.trim(),
            name_vn: nameVn.trim() || name.trim(),
            base_unit: unit,
            brand: brand.trim(),
            packs: [pack, ...otherPacks],
            staff: {
              listed: false,
              hidden,
              supplier_id: supplierId,
              unit,
              item_no: itemNo.trim(),
            },
          },
          !initial,
        );
      }}
    >
      <h2 className="staffAdminTitle">{initial ? "Редактирование позиции" : "Новая позиция"}</h2>
      <label>
        <span>Название *</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        <span>Название VN</span>
        <input value={nameVn} onChange={(event) => setNameVn(event.target.value)} />
      </label>
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Поставщик *</span>
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Единица *</span>
          <select value={unit} onChange={(event) => setUnit(event.target.value)}>
            {UNITS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Фасовка *</span>
          <input value={packLabel} onChange={(event) => setPackLabel(event.target.value)} required />
        </label>
        <label>
          <span>Кол-во в базе</span>
          <input inputMode="decimal" value={packQty} onChange={(event) => setPackQty(event.target.value)} />
        </label>
      </div>
      <label>
        <span>SKU код фасовки</span>
        <input value={packCode} onChange={(event) => setPackCode(event.target.value)} />
      </label>
      <div className="formGrid staffAdminGrid">
        <label>
          <span>Бренд</span>
          <input value={brand} onChange={(event) => setBrand(event.target.value)} />
        </label>
        <label>
          <span>Артикул</span>
          <input value={itemNo} onChange={(event) => setItemNo(event.target.value)} />
        </label>
      </div>
      <label className="staffAdminCheck">
        <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
        <span>Скрыть у сотрудников</span>
      </label>
      <div className="adminActions">
        <button type="submit" className="dark" disabled={busy || !canSave}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="white" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
      {onArchive ? (
        <button type="button" className="white danger staffAdminDelete" disabled={busy} onClick={onArchive}>
          🗑 В архив
        </button>
      ) : null}
    </form>
  );
}

function SupplierForm({
  initial,
  busy,
  onCancel,
  onSave,
  onArchive,
}: {
  initial: OrderSupplier | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>, isNew: boolean) => void;
  onArchive?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [zaloUrl, setZaloUrl] = useState(initial?.zaloUrl ?? "");
  const zaloValid = !zaloUrl.trim() || /^https:\/\/\S+$/i.test(zaloUrl.trim());

  return (
    <form
      className="card formSection"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !zaloValid) return;
        onSave({ id: initial?.id, name: name.trim(), zalo_url: zaloUrl.trim() }, !initial);
      }}
    >
      <h2 className="staffAdminTitle">{initial ? "Редактирование поставщика" : "Новый поставщик"}</h2>
      <label>
        <span>Название *</span>
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <label>
        <span>Ссылка на группу Zalo</span>
        <input inputMode="url" placeholder="https://zalo.me/g/…" value={zaloUrl} onChange={(event) => setZaloUrl(event.target.value)} />
      </label>
      {zaloValid ? null : <small className="staffAdminHint error">Ссылка должна начинаться с https://</small>}
      <div className="adminActions">
        <button type="submit" className="dark" disabled={busy || !name.trim() || !zaloValid}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className="white" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
      {onArchive ? (
        <button type="button" className="white danger staffAdminDelete" disabled={busy} onClick={onArchive}>
          🗑 В архив
        </button>
      ) : null}
    </form>
  );
}
