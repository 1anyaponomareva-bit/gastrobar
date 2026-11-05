import { productTitle } from "@/lib/erp/costing";
import type { ErpDocument, ErpDocumentLine, ErpState } from "@/lib/erp/types";

const stockQty = (state: ErpState, productId: string, warehouseId: string | null | undefined): number =>
  warehouseId ? (state.stock.find((row) => row.product_id === productId && row.warehouse_id === warehouseId)?.qty ?? 0) : 0;

export type CountMode = "full" | "partial";
export type CountWhen = "backdated" | "now";
export type CountLogic = "counts-api" | "documents-fallback";

export type CountMovement = {
  id: string;
  doc_type: string;
  doc_id: string;
  doc_no?: string;
  at: string;
  qty: number;
  cost?: number | null;
  href?: string;
};

export type CountLine = {
  product_id: string;
  last_check: string | null;
  opening_qty: number | null;
  in_qty: number | null;
  out_qty: number | null;
  writeoff_qty: number | null;
  planned_qty: number | null;
  fact_qty: number | null;
  diff_qty: number | null;
  diff_amount: number | null;
  cost_known: boolean | null;
  pack_id: string | null;
  pack_qty: number | null;
  movements?: { in?: CountMovement[]; out?: CountMovement[]; writeoff?: CountMovement[] };
};

export type CountMeta = {
  mode: CountMode;
  when: CountWhen;
  counted_at: string;
  product_ids: string[];
  category_ids: string[];
};

export type CountDoc = {
  id?: string;
  doc_no?: string;
  warehouse_id: string | null;
  mode: CountMode;
  when: CountWhen;
  counted_at: string;
  period_start: string | null;
  product_ids: string[];
  category_ids: string[];
  status: string;
  result_amount: number | null;
  result_known: boolean;
  comment: string;
  lock_version?: number;
  created_at?: string;
  created_by?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  lines: CountLine[];
  logic: CountLogic;
  postingReady: boolean;
  periodReady: boolean;
};

export type CountListItem = {
  id: string;
  doc_no?: string;
  warehouse_id: string | null;
  period_start: string | null;
  posted_at: string | null;
  counted_at: string | null;
  mode: CountMode;
  result_amount: number | null;
  result_known: boolean;
  status: string;
  created_at?: string;
  created_by?: string | null;
  comment: string;
};

export type CountsPage = { documents: CountListItem[]; more: boolean; logic: CountLogic };

const META_PREFIX = "INVJSON:";

export function nowDateTimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function encodeCountComment(meta: CountMeta, comment: string): string {
  return `${META_PREFIX}${JSON.stringify(meta)}${comment.trim() ? `\n${comment.trim()}` : ""}`;
}

export function decodeCountComment(comment: string | null | undefined): { meta: Partial<CountMeta>; comment: string } {
  if (!comment?.startsWith(META_PREFIX)) {
    const mode = comment === "partial" || comment === "full" ? comment : undefined;
    return { meta: mode ? { mode } : {}, comment: comment ?? "" };
  }
  const nl = comment.indexOf("\n");
  const raw = nl === -1 ? comment.slice(META_PREFIX.length) : comment.slice(META_PREFIX.length, nl);
  const rest = nl === -1 ? "" : comment.slice(nl + 1);
  try {
    return { meta: JSON.parse(raw) as Partial<CountMeta>, comment: rest };
  } catch {
    return { meta: {}, comment };
  }
}

const asMode = (value: unknown): CountMode => (value === "partial" ? "partial" : "full");
const asWhen = (value: unknown): CountWhen => (value === "backdated" ? "backdated" : "now");

type DocLike = ErpDocument & {
  count_kind?: string | null;
  counted_at?: string | null;
  occurred_at?: string | null;
  count_scope?: { product_ids?: string[]; category_ids?: string[] } | null;
};

type LineLike = ErpDocumentLine & {
  counted?: boolean;
  fact_qty?: number | null;
  opening_qty?: number | null;
  in_qty?: number | null;
  out_qty?: number | null;
  book_qty?: number | null;
  period_start?: string | null;
  last_count_id?: string | null;
  count_moves?: { document_id: string; doc_no: string; doc_type: string; occurred_at: string; qty: number; direction: "in" | "out" }[] | null;
};

function listItemFromDocument(doc: DocLike): CountListItem | null {
  if (!doc.id) return null;
  const { meta, comment } = decodeCountComment(doc.comment ?? doc.reason);
  const mode = asMode(doc.count_kind ?? meta.mode ?? doc.reason);
  return {
    id: doc.id,
    doc_no: doc.doc_no,
    warehouse_id: doc.warehouse_id ?? null,
    period_start: null,
    posted_at: doc.posted_at ?? doc.occurred_at ?? null,
    counted_at: doc.counted_at ?? meta.counted_at ?? doc.posted_at ?? (doc.doc_date ? `${doc.doc_date}T00:00` : null),
    mode,
    result_amount: doc.status === "posted" ? (doc.total_cost ?? null) : null,
    result_known: doc.status === "posted" ? doc.cost_known !== false : true,
    status: doc.status ?? "draft",
    created_at: doc.created_at,
    created_by: doc.created_by ?? null,
    comment,
  };
}

function movesFromLine(line: LineLike): CountLine["movements"] {
  const raw = line.count_moves ?? [];
  if (!raw.length) return undefined;
  const toMove = (m: NonNullable<LineLike["count_moves"]>[number], kind: "in" | "out" | "writeoff"): CountMovement => ({
    id: `${m.document_id}-${m.occurred_at}-${kind}`,
    doc_type: m.doc_type,
    doc_id: m.document_id,
    doc_no: m.doc_no,
    at: m.occurred_at,
    qty: m.qty,
    href: `/erp/documents/${m.document_id}`,
  });
  return {
    in: raw.filter((m) => m.direction === "in").map((m) => toMove(m, "in")),
    out: raw.filter((m) => m.direction === "out" && m.doc_type !== "writeoff").map((m) => toMove(m, "out")),
    writeoff: raw.filter((m) => m.doc_type === "writeoff").map((m) => toMove(m, "writeoff")),
  };
}

function lineFromDocument(line: LineLike): CountLine {
  const counted = line.counted === true || (line.counted !== false && line.reason !== "uncounted" && line.fact_qty !== null && line.fact_qty !== undefined);
  const fact = counted ? (line.fact_qty ?? line.qty) : null;
  const outQty = line.out_qty ?? null;
  const writeoff = line.count_moves?.filter((m) => m.doc_type === "writeoff").reduce((sum, m) => sum + m.qty, 0) ?? null;
  return {
    product_id: line.product_id,
    last_check: line.period_start ?? null,
    opening_qty: line.opening_qty ?? null,
    in_qty: line.in_qty ?? null,
    out_qty: writeoff !== null && outQty !== null ? outQty - writeoff : outQty,
    writeoff_qty: writeoff,
    planned_qty: line.book_qty ?? line.planned_qty ?? line.system_qty ?? null,
    fact_qty: fact,
    diff_qty: counted ? (line.diff_qty ?? null) : null,
    diff_amount: counted ? (line.cost_amount ?? null) : null,
    cost_known: line.cost_known ?? null,
    pack_id: line.pack_id ?? null,
    pack_qty: line.pack_qty ?? null,
    movements: movesFromLine(line),
  };
}

export function countFromDocument(doc: DocLike, logic: CountLogic, postingReady: boolean, periodReady: boolean): CountDoc {
  const { meta, comment } = decodeCountComment(doc.comment ?? doc.reason);
  const scope = doc.count_scope ?? {};
  return {
    id: doc.id,
    doc_no: doc.doc_no,
    warehouse_id: doc.warehouse_id ?? null,
    mode: asMode(doc.count_kind ?? meta.mode ?? doc.reason),
    when: asWhen(meta.when),
    counted_at: toLocalInput(doc.counted_at ?? meta.counted_at ?? doc.occurred_at ?? (doc.doc_date ? `${doc.doc_date}T00:00` : nowDateTimeLocal())),
    period_start: doc.lines?.[0] && "period_start" in (doc.lines[0] as LineLike) ? ((doc.lines[0] as LineLike).period_start ?? null) : null,
    product_ids: scope.product_ids ?? meta.product_ids ?? [],
    category_ids: scope.category_ids ?? meta.category_ids ?? [],
    status: doc.status ?? "draft",
    result_amount: doc.status === "posted" ? (doc.total_cost ?? null) : null,
    result_known: doc.status === "posted" ? doc.cost_known !== false : true,
    comment,
    lock_version: doc.lock_version,
    created_at: doc.created_at,
    created_by: doc.created_by ?? null,
    posted_at: doc.posted_at ?? null,
    posted_by: doc.posted_by ?? null,
    lines: (doc.lines ?? []).map((line) => lineFromDocument(line as LineLike)),
    logic,
    postingReady,
    periodReady,
  };
}

export function documentFromCount(doc: CountDoc): Record<string, unknown> {
  const meta: CountMeta = {
    mode: doc.mode,
    when: doc.when,
    counted_at: doc.counted_at,
    product_ids: doc.product_ids,
    category_ids: doc.category_ids,
  };
  return {
    id: doc.id,
    doc_type: "count",
    doc_date: doc.counted_at.slice(0, 10),
    counted_at: doc.counted_at,
    occurred_at: doc.when === "now" ? null : doc.counted_at,
    count_kind: doc.mode,
    count_scope: { product_ids: doc.product_ids, category_ids: doc.category_ids },
    warehouse_id: doc.warehouse_id,
    reason: doc.mode,
    comment: encodeCountComment(meta, doc.comment),
    lock_version: doc.lock_version,
    lines: doc.lines.map((line, index) => ({
      line_no: index + 1,
      product_id: line.product_id,
      qty: line.fact_qty ?? 0,
      fact_qty: line.fact_qty,
      counted: line.fact_qty !== null,
      planned_qty: line.planned_qty,
      pack_id: line.pack_id,
      pack_qty: line.pack_qty,
      reason: line.fact_qty === null ? "uncounted" : "counted",
    })),
  };
}

function toLocalInput(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const at = Date.parse(value);
  if (Number.isNaN(at)) return value.slice(0, 16);
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Temporary rows until /api/erp/counts returns the period list. Does not explode recipes. */
export function fallbackCountLines(state: ErpState, warehouseId: string, mode: CountMode, productIds: string[], categoryIds: string[]): CountLine[] {
  const cats = new Set(categoryIds);
  const picked = new Set(productIds);
  const products = state.products.filter((p) => !p.archived_at && p.base_unit);
  const chosen =
    mode === "partial"
      ? products.filter((p) => picked.has(p.id) || (p.category_id && cats.has(p.category_id)))
      : products.filter((p) => stockQty(state, p.id, warehouseId) !== 0);
  return chosen
    .sort((a, b) => productTitle(a).localeCompare(productTitle(b), "ru") || (a.brand ?? "").localeCompare(b.brand ?? "") || a.id.localeCompare(b.id))
    .map((p) => ({
      product_id: p.id,
      last_check: null,
      opening_qty: null,
      in_qty: null,
      out_qty: null,
      writeoff_qty: null,
      planned_qty: stockQty(state, p.id, warehouseId),
      fact_qty: null,
      diff_qty: null,
      diff_amount: null,
      cost_known: null,
      pack_id: null,
      pack_qty: null,
    }));
}

function periodStartByWarehouse(items: CountListItem[]): CountListItem[] {
  const posted = items
    .filter((row) => row.status === "posted" && row.warehouse_id && (row.posted_at || row.counted_at))
    .sort((a, b) => String(a.posted_at ?? a.counted_at).localeCompare(String(b.posted_at ?? b.counted_at)));
  const prev = new Map<string, string>();
  return items.map((row) => {
    const start = row.period_start ?? (row.warehouse_id ? prev.get(row.warehouse_id) ?? null : null);
    if (row.status === "posted" && row.warehouse_id) {
      prev.set(row.warehouse_id, row.posted_at ?? row.counted_at ?? "");
    }
    return { ...row, period_start: start };
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function fetchCountList(from: string, to: string): Promise<CountsPage> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const counts = await fetch(`/api/erp/counts?${params}`, { cache: "no-store" });
  if (counts.ok) {
    const data = await readJson(counts);
    const raw = (data.documents as DocLike[]) ?? [];
    const documents = periodStartByWarehouse(raw.map(listItemFromDocument).filter((row): row is CountListItem => Boolean(row)));
    return { documents, more: Boolean(data.more), logic: "counts-api" };
  }
  if (counts.status !== 404) {
    const data = await readJson(counts);
    throw new Error(typeof data.error === "string" ? data.error : "server");
  }
  const docs = await fetch(`/api/erp/documents?type=count&limit=300${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, { cache: "no-store" });
  const data = await readJson(docs);
  if (!docs.ok) throw new Error(typeof data.error === "string" ? data.error : "server");
  const documents = ((data.documents as ErpDocument[]) ?? []).map(listItemFromDocument).filter((row): row is CountListItem => Boolean(row));
  return { documents: periodStartByWarehouse(documents), more: Boolean(data.more), logic: "documents-fallback" };
}

export async function fetchCountDoc(id: string): Promise<CountDoc> {
  const byQuery = await fetch(`/api/erp/counts?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (byQuery.ok) {
    const data = await readJson(byQuery);
    const raw = (data.count ?? data.document ?? data) as DocLike;
    return countFromDocument(raw, "counts-api", true, true);
  }
  if (byQuery.status !== 404) {
    const data = await readJson(byQuery);
    throw new Error(typeof data.error === "string" ? data.error : "server");
  }
  const counts = await fetch(`/api/erp/counts/${id}`, { cache: "no-store" });
  if (counts.ok) {
    const data = await readJson(counts);
    const raw = (data.count ?? data.document ?? data) as DocLike;
    return countFromDocument(raw, "counts-api", true, true);
  }
  if (counts.status !== 404) {
    const data = await readJson(counts);
    throw new Error(typeof data.error === "string" ? data.error : "server");
  }
  const docs = await fetch(`/api/erp/documents/${id}`, { cache: "no-store" });
  const data = await readJson(docs);
  if (!docs.ok) throw new Error(typeof data.error === "string" ? data.error : "server");
  return countFromDocument(data.document as ErpDocument, "documents-fallback", false, false);
}

export async function saveCountViaApi(doc: CountDoc): Promise<{ id: string; document?: DocLike; count?: DocLike } | null> {
  const response = await fetch("/api/erp/counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "save", document: documentFromCount(doc) }),
  });
  if (response.status === 404) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "server");
  return { id: String(data.id ?? doc.id ?? ""), document: data.document as DocLike | undefined, count: data.count as DocLike | undefined };
}

export async function postCountViaApi(doc: CountDoc): Promise<{ id: string; document?: DocLike; count?: DocLike } | null> {
  const response = await fetch("/api/erp/counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "post", id: doc.id, document: documentFromCount(doc) }),
  });
  if (response.status === 404) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "server");
  return { id: String(data.id ?? doc.id ?? ""), document: data.document as DocLike | undefined, count: data.count as DocLike | undefined };
}

export async function previewCountViaApi(doc: CountDoc): Promise<DocLike | null> {
  const response = await fetch("/api/erp/counts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "preview",
      preview: {
        warehouse_id: doc.warehouse_id,
        count_kind: doc.mode,
        counted_at: doc.when === "backdated" ? doc.counted_at : null,
        product_ids: doc.product_ids,
        category_ids: doc.category_ids,
      },
    }),
  });
  if (response.status === 404) return null;
  const data = await readJson(response);
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "server");
  return (data.preview ?? data) as DocLike;
}

export const DRAFT_STORE = "gastrofood-erp-inventory-draft";

export type LocalDraft = { at: number; doc: CountDoc };

export function readLocalDraft(id: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_STORE}:${id}`);
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(id: string, doc: CountDoc) {
  window.localStorage.setItem(`${DRAFT_STORE}:${id}`, JSON.stringify({ at: Date.now(), doc }));
}

export function clearLocalDraft(id: string) {
  window.localStorage.removeItem(`${DRAFT_STORE}:${id}`);
}

export function mergeDraft(server: CountDoc, local: LocalDraft | null): CountDoc {
  if (!local || server.status !== "draft") return server;
  const serverAt = server.created_at ? Date.parse(server.created_at) : 0;
  if (local.at + 50 < serverAt) return server;
  const facts = new Map(local.doc.lines.map((line) => [line.product_id, line]));
  return {
    ...server,
    ...local.doc,
    id: server.id,
    doc_no: server.doc_no,
    status: server.status,
    lock_version: server.lock_version,
    logic: server.logic,
    postingReady: server.postingReady,
    periodReady: server.periodReady,
    lines: server.lines.map((line) => {
      const saved = facts.get(line.product_id);
      return saved ? { ...line, fact_qty: saved.fact_qty, pack_id: saved.pack_id, pack_qty: saved.pack_qty } : line;
    }),
  };
}
