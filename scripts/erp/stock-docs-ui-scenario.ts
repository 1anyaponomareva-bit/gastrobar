/**
 * Isolated processing/transfers export+print and write-off phone width
 * (own Next + PGlite, unique port, headless Chrome via CDP). Does not write to production.
 *
 * Run: npx tsx scripts/erp/stock-docs-ui-scenario.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ROOT = process.cwd();
const DB_DIR = path.join(ROOT, ".erp-stock-ui-accept-db", String(Date.now()));
const SKIP_PORTS = new Set([3012, 3047, 3053, 3060, 3061, 3062, 3077]);

type Json = Record<string, unknown>;

function freePort(from = 3080): Promise<number> {
  const tryPort = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      if (SKIP_PORTS.has(port)) return void tryPort(port + 1).then(resolve, reject);
      const server = createServer();
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE" && port < from + 40) void tryPort(port + 1).then(resolve, reject);
        else reject(error);
      });
      server.listen({ port, host: "127.0.0.1", exclusive: true }, () => {
        server.close(() => resolve(port));
      });
    });
  return tryPort(from);
}

async function waitReady(child: ChildProcess, port: number) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("next dev did not start")), 120_000);
    const onData = (buf: Buffer) => {
      const text = buf.toString();
      process.stdout.write(text);
      if (/ready|started server|local:/i.test(text)) {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`next exited ${code}`));
    });
  });
  for (let i = 0; i < 120; i++) {
    const res = await fetch(`http://127.0.0.1:${port}/api/erp/state`).catch(() => null);
    if (res?.ok || res?.status === 401) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("ERP state never answered");
}

async function api(base: string, url: string, init?: RequestInit): Promise<Json> {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok) throw new Error(`${response.status} ${String(data.error ?? "api")} ${url}`);
  return data;
}

async function act(base: string, body: Json): Promise<Json> {
  return api(base, "/api/erp/action", { method: "POST", body: JSON.stringify(body) });
}

function killTree(child: ChildProcess | undefined) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

function parseCsv(raw: string): string[][] {
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((part) => part.length) || row.length > 1) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type CapturedFile = { name: string; type: string; raw: string; bytes: number[] };

function csvFile(files: CapturedFile[]) {
  return files.find((file) => file.name.endsWith(".csv") || file.type.includes("csv"));
}

function xlsxFile(files: CapturedFile[]) {
  return files.find((file) => file.name.endsWith(".xlsx") || file.type.includes("spreadsheet"));
}

type CdpResult = { result?: { value?: unknown }; exceptionDetails?: { text?: string } };

class Cdp {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private constructor(
    private ws: WebSocket,
    private sessionId?: string,
  ) {
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data)) as {
        id?: number;
        sessionId?: string;
        result?: unknown;
        error?: { message?: string };
      };
      if (msg.id == null) return;
      if (this.sessionId && msg.sessionId && msg.sessionId !== this.sessionId) return;
      const wait = this.pending.get(msg.id);
      if (!wait) return;
      this.pending.delete(msg.id);
      if (msg.error) wait.reject(new Error(msg.error.message ?? "cdp"));
      else wait.resolve(msg.result ?? {});
    });
  }

  static async connect(debugPort: number): Promise<Cdp> {
    const deadline = Date.now() + 20_000;
    let version: { webSocketDebuggerUrl?: string } | null = null;
    while (Date.now() < deadline) {
      version = (await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((r) => r.json()).catch(() => null)) as {
        webSocketDebuggerUrl?: string;
      } | null;
      if (version?.webSocketDebuggerUrl) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!version?.webSocketDebuggerUrl) throw new Error("chrome debug port did not come up");
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () => reject(new Error("chrome websocket failed")));
    });
    const browser = new Cdp(ws);
    const created = (await browser.send("Target.createTarget", { url: "about:blank" })) as { targetId: string };
    const attached = (await browser.send("Target.attachToTarget", { targetId: created.targetId, flatten: true })) as { sessionId: string };
    return new Cdp(ws, attached.sessionId);
  }

  async send(method: string, params?: Json): Promise<unknown> {
    this.seq += 1;
    const id = this.seq;
    const payload: Json = { id, method, params: params ?? {} };
    if (this.sessionId) payload.sessionId = this.sessionId;
    return await new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }

  async eval<T>(expression: string): Promise<T> {
    const out = (await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })) as CdpResult;
    if (out.exceptionDetails) {
      const extra = (out.exceptionDetails as { exception?: { description?: string }; text?: string }).exception?.description;
      throw new Error(extra || out.exceptionDetails.text || expression);
    }
    return out.result?.value as T;
  }

  async goto(url: string) {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Page.navigate", { url });
    await this.eval(`new Promise((resolve) => {
      if (document.readyState === "complete") resolve(true);
      else window.addEventListener("load", () => resolve(true), { once: true });
    })`);
  }

  close() {
    this.ws.close();
  }
}

async function waitExportReady(page: Cdp) {
  for (let i = 0; i < 90; i++) {
    const info = await page.eval<{ ready: boolean; text: string }>(`(() => {
      const btn = document.querySelector("[data-testid=docs-export]");
      return { ready: Boolean(btn && !btn.disabled), text: document.body.innerText.slice(0, 180) };
    })()`);
    if (info.ready) return;
    if (i % 6 === 0) console.log(`waiting export: ${info.text.replace(/\s+/g, " ")}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("export button never enabled");
}

async function captureExport(page: Cdp): Promise<{ csv: { name: string; rows: string[][]; raw: string }; xlsx: CapturedFile }> {
  const files = await page.eval<CapturedFile[]>(`(async () => {
    const files = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const index = files.length;
      files.push({ name: "", type: blob.type || "", raw: "", bytes: [] });
      blob.arrayBuffer().then((buf) => {
        const bytes = Array.from(new Uint8Array(buf));
        files[index].bytes = bytes;
        files[index].raw = new TextDecoder("utf-8").decode(new Uint8Array(bytes));
      });
      return orig(blob);
    };
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      const last = files.at(-1);
      if (last) last.name = this.download || last.name;
      return origClick.apply(this);
    };
    const btn = document.querySelector("[data-testid=docs-export]");
    if (!btn || btn.disabled) throw new Error("export disabled");
    btn.click();
    for (let i = 0; i < 100 && (files.length < 2 || files.some((file) => !file.raw)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    URL.createObjectURL = orig;
    HTMLAnchorElement.prototype.click = origClick;
    if (files.length < 2 || files.some((file) => !file.raw)) throw new Error("expected csv and xlsx, got " + files.map((f) => f.name || f.type).join(","));
    return files;
  })()`);
  const csv = csvFile(files);
  const xlsx = xlsxFile(files);
  if (!csv) throw new Error(`CSV missing: ${files.map((f) => `${f.name}:${f.type}:${f.bytes.slice(0, 4).join(",")}`).join("; ")}`);
  if (!xlsx) throw new Error(`XLSX missing: ${files.map((f) => `${f.name}:${f.type}:${f.bytes.slice(0, 4).join(",")}`).join("; ")}`);
  const bom = csv.bytes[0] === 0xef && csv.bytes[1] === 0xbb && csv.bytes[2] === 0xbf;
  if (!bom) throw new Error(`CSV missing BOM bytes=${csv.bytes.slice(0, 8).join(",")} name=${csv.name} type=${csv.type}`);
  if (xlsx.bytes[0] !== 0x50 || xlsx.bytes[1] !== 0x4b) throw new Error(`XLSX is not a ZIP bytes=${xlsx.bytes.slice(0, 4).join(",")}`);
  const csvText = csv.raw.charCodeAt(0) === 0xfeff ? csv.raw : new TextDecoder("utf-8").decode(Uint8Array.from(csv.bytes));
  return { csv: { name: csv.name, raw: csvText, rows: parseCsv(csvText) }, xlsx };
}

function assertListExport(kind: "transfers" | "processing", files: { csv: { name: string; rows: string[][]; raw: string }; xlsx: CapturedFile }, needle: string, count: number) {
  if (!files.csv.name.startsWith(`${kind}_`) || !files.csv.name.endsWith(".csv")) throw new Error(`bad csv name ${files.csv.name}`);
  if (!files.xlsx.name.startsWith(`${kind}_`) || !files.xlsx.name.endsWith(".xlsx")) throw new Error(`bad xlsx name ${files.xlsx.name}`);
  const header = files.csv.rows[0] ?? [];
  if (kind === "processing") {
    if (header.length < 4) throw new Error(`csv header ${header.join("|")}`);
    if (!header.some((cell) => /исходн|source|nguyên/i.test(cell))) throw new Error(`csv header ${header.join("|")}`);
    if (!header.some((cell) => /полученн|result|sản phẩm nhận/i.test(cell))) throw new Error(`csv header ${header.join("|")}`);
  } else {
    if (header.length !== 5) throw new Error(`csv header ${header.join("|")}`);
    if (!header.includes("Документ") && !header.includes("Document")) throw new Error(`csv header ${header.join("|")}`);
  }
  if (header.some((cell) => /счёт|счет|account|оплат|payment/i.test(cell))) {
    throw new Error(`account/payment column leaked: ${header.join("|")}`);
  }
  if (files.csv.rows.length - 1 !== count) throw new Error(`${kind} csv rows ${files.csv.rows.length - 1}, want ${count}`);
  const body = files.csv.rows.slice(1).map((row) => row.join(" | "));
  if (needle && !body.some((line) => line.includes(needle))) {
    throw new Error(`${kind} csv missing ${needle}:\n${body.slice(0, 5).join("\n")}`);
  }
  if (needle && !files.xlsx.raw.includes(needle)) throw new Error(`${kind} xlsx missing ${needle}`);
  const xlsxHeader = header.find((cell) => files.xlsx.raw.includes(cell));
  if (!xlsxHeader) throw new Error(`${kind} xlsx missing csv header`);
}

async function capturePrint(page: Cdp): Promise<{ title: string; rows: number; cols: number; text: string }> {
  await page.eval(`(async () => {
    window.__printed = false;
    window.print = () => { window.__printed = true; };
    const btn = document.querySelector("[data-testid=docs-print]");
    if (!btn || btn.disabled) throw new Error("print disabled");
    btn.click();
    for (let i = 0; i < 80 && !window.__printed; i++) await new Promise((r) => setTimeout(r, 100));
    if (!window.__printed) throw new Error("window.print was not called");
  })()`);
  await page.send("Emulation.setEmulatedMedia", { media: "print" });
  const out = await page.eval<{ title: string; rows: number; cols: number; text: string }>(`(() => {
    const area = document.querySelector("[data-testid=docs-print-area]");
    const table = document.querySelector("[data-testid=docs-print-table]");
    if (!area || !table) throw new Error("print table missing");
    const text = area.innerText;
    const screen = document.querySelector(".erpDocsScreen");
    const screenHidden = !screen || getComputedStyle(screen).display === "none";
    if (!screenHidden) throw new Error("screen table still visible in print");
    return {
      title: text.split("\\n")[0] || "",
      rows: table.querySelectorAll("tbody tr").length,
      cols: table.querySelectorAll("thead th").length,
      text,
    };
  })()`);
  await page.send("Emulation.setEmulatedMedia", { media: "" });
  return out;
}

async function fillSearch(page: Cdp, value: string) {
  await page.eval(`(() => {
    const input = document.querySelector("[data-testid=docs-search]");
    if (!input) throw new Error("search missing");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await new Promise((r) => setTimeout(r, 500));
}

async function main() {
  await mkdir(DB_DIR, { recursive: true });
  const port = await freePort();
  const debugPort = await freePort(9222);
  const base = `http://127.0.0.1:${port}`;
  console.log(`isolated next ${base} db ${DB_DIR}`);
  const child = spawn("npx", ["next", "dev", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      ERP_LOCAL_DB: "pglite",
      ERP_LOCAL_DB_DIR: DB_DIR,
      NODE_ENV: "development",
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chromeUser = path.join(DB_DIR, "chrome");
  await mkdir(chromeUser, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${chromeUser}`,
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--allow-insecure-localhost",
      "--disable-web-security",
    ],
    { stdio: "ignore" },
  );
  let page: Cdp | undefined;
  try {
    await waitReady(child, port);
    const state = await api(base, "/api/erp/state");
    const warehouses = (state.warehouses as { id: string; code: string; name: string }[]) ?? [];
    const from = warehouses.find((w) => w.code === "warehouse") ?? warehouses[0];
    const to = warehouses.find((w) => w.code === "prep-kitchen") ?? warehouses[1] ?? warehouses[0];
    const uniqueWh = warehouses.find((w) => w.code === "food-truck") ?? warehouses.at(-1);
    if (!from?.id || !to?.id || !uniqueWh?.id) throw new Error("need warehouses");

    const flour = String((await act(base, { action: "saveProduct", product: { type: "ingredient", name_en: "UI Flour", name_vn: "Bột UI", base_unit: "kg" } })).id);
    const soup = String(
      (await act(base, { action: "saveProduct", product: { type: "semi_finished", name_en: "UI-PROC-SOUP", name_vn: "Súp UI", base_unit: "kg" } })).id,
    );
    const other = String(
      (await act(base, { action: "saveProduct", product: { type: "semi_finished", name_en: "UI-PROC-OTHER", name_vn: "Khác UI", base_unit: "kg" } })).id,
    );
    const longName = "UI Very Long Writeoff Product Name For Phone Width Check Extra Extra Extra Extra Extra";
    const long = String((await act(base, { action: "saveProduct", product: { type: "ingredient", name_en: longName, name_vn: longName, base_unit: "kg" } })).id);

    const saveTransfer = (target: string) =>
      act(base, {
        action: "saveDocument",
        document: { doc_type: "transfer", warehouse_id: from.id, target_warehouse_id: target, lines: [{ product_id: flour, qty: 0.1 }] },
      });
    const saveProc = (output: string) =>
      act(base, {
        action: "saveDocument",
        document: {
          doc_type: "production",
          warehouse_id: to.id,
          target_warehouse_id: to.id,
          output_product_id: output,
          output_qty: 1,
          plan_output_qty: 1,
          lines: [{ product_id: flour, qty: 0.1 }],
        },
      });

    const bulk = 52;
    for (let i = 0; i < bulk; i += 8) {
      await Promise.all(Array.from({ length: Math.min(8, bulk - i) }, () => saveTransfer(to.id)));
    }
    await saveTransfer(uniqueWh.id);
    await saveProc(soup);
    await saveProc(soup);
    await saveProc(other);
    await act(base, {
      action: "saveDocument",
      document: { doc_type: "writeoff", warehouse_id: from.id, lines: [{ product_id: long, qty: 0.2 }] },
    });

    const listed = await api(base, "/api/erp/documents?type=transfer&limit=50");
    const listedN = Array.isArray(listed.documents) ? listed.documents.length : 0;
    if (listedN !== 50 || listed.more !== true) {
      throw new Error(`expected list page 50+more, got ${listedN} more=${String(listed.more)}`);
    }
    const allTransfers = await api(base, "/api/erp/documents?type=transfer&limit=300");
    const transferN = Array.isArray(allTransfers.documents) ? allTransfers.documents.length : 0;
    if (transferN !== 53) throw new Error(`expected 53 transfers, got ${transferN}`);

    const warmPage = async (path: string) => {
      console.log(`warming ${path}`);
      let html = "";
      for (let i = 0; i < 60; i++) {
        const res = await fetch(`${base}${path}`).catch(() => null);
        html = res ? await res.text() : "";
        if (res?.ok && html.length > 800 && !/compil/i.test(html)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      const scripts = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]);
      console.log(`warming ${scripts.length} script chunks for ${path}`);
      for (const src of scripts) {
        for (let i = 0; i < 60; i++) {
          const res = await fetch(`${base}${src}`).catch(() => null);
          if (res?.ok) break;
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    };
    await warmPage("/erp/stock/transfers");
    await warmPage("/erp/menu/processing");
    await warmPage("/erp/stock/writeoffs");

    const uniqueLabel = uniqueWh.name.includes("Food Truck") ? "Food Truck" : uniqueWh.name;
    page = await Cdp.connect(debugPort);
    await page
      .send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: chromeUser, eventsEnabled: false })
      .catch(() => page.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: chromeUser }));
    await page.goto(`${base}/erp/stock/transfers`);
    await waitExportReady(page);

    const allTransfersExport = await captureExport(page);
    assertListExport("transfers", allTransfersExport, uniqueLabel, 53);
    console.log(`transfers export all: ${allTransfersExport.csv.name} rows=${allTransfersExport.csv.rows.length - 1}`);

    await fillSearch(page, uniqueLabel);
    const filteredTransfers = await captureExport(page);
    assertListExport("transfers", filteredTransfers, uniqueLabel, 1);
    console.log("transfers export filtered: 1 row ok");

    const printFiltered = await capturePrint(page);
    if (printFiltered.rows !== 1) throw new Error(`print filtered transfers ${printFiltered.rows}`);
    if (printFiltered.cols !== 5) throw new Error(`print cols ${printFiltered.cols}`);
    if (!printFiltered.text.includes("Перемещения") && !printFiltered.text.includes("Transfers")) {
      throw new Error(`print title: ${printFiltered.title}`);
    }
    if (!printFiltered.text.includes(uniqueLabel)) {
      throw new Error(`print missing unique warehouse: ${printFiltered.text}`);
    }
    console.log(`transfers print filtered: ${printFiltered.rows} row, title=${printFiltered.title}`);

    await fillSearch(page, "");
    const printAll = await capturePrint(page);
    if (printAll.rows !== 53) throw new Error(`print all transfers ${printAll.rows}, want 53 not one page`);
    if (printAll.cols !== 5) throw new Error(`print all cols ${printAll.cols}`);
    console.log(`transfers print all: ${printAll.rows} rows`);

    await page.goto(`${base}/erp/menu/processing`);
    await waitExportReady(page);
    const procAll = await captureExport(page);
    assertListExport("processing", procAll, "UI-PROC-SOUP", 3);
    console.log(`processing export all: ${procAll.csv.rows.length - 1} rows`);

    await fillSearch(page, "UI-PROC-SOUP");
    const procFiltered = await captureExport(page);
    assertListExport("processing", procFiltered, "UI-PROC-SOUP", 2);
    console.log(`processing export filtered: ${procFiltered.csv.rows.length - 1} rows`);

    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await page.goto(`${base}/erp/stock/writeoffs`);
    await page.eval(`(async () => {
      for (let i = 0; i < 120; i++) {
        if (document.querySelector("[data-testid=wo-row] [data-testid=wo-row-menu]")) return true;
        const empty = document.querySelector("[data-testid=wo-empty]");
        if (empty && i > 12) throw new Error("write-off list empty");
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error("write-off row actions missing: " + document.body.innerText.slice(0, 280).replace(/\\s+/g, " "));
    })()`);
    const metrics = await page.eval<{
      docScroll: number;
      client: number;
      wrapClient: number;
      wrapScroll: number;
      tableW: number;
      menuRight: number;
      menuInView: boolean;
      dateInView: boolean;
      menuOpen: boolean;
      product: string;
      afterScrollMenuInView: boolean;
      afterScrollDateInView: boolean;
      afterScrollDoc: number;
    }>(`(async () => {
      const wrap = document.querySelector("[data-testid=wo-table-wrap]");
      const table = document.querySelector("[data-testid=wo-table]");
      const menu = document.querySelector("[data-testid=wo-row] [data-testid=wo-row-menu]");
      const date = document.querySelector("[data-testid=wo-row] .erpWoDateCol");
      const products = document.querySelector("[data-testid=wo-row] .erpWoProducts");
      const inView = (el) => {
        const box = el?.getBoundingClientRect();
        return box ? box.right <= window.innerWidth + 1 && box.left >= -1 : false;
      };
      menu?.click();
      await new Promise((r) => setTimeout(r, 120));
      const before = {
        docScroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        wrapClient: wrap?.clientWidth ?? 0,
        wrapScroll: wrap?.scrollWidth ?? 0,
        tableW: table?.getBoundingClientRect().width ?? 0,
        menuRight: menu?.getBoundingClientRect().right ?? 0,
        menuInView: inView(menu),
        dateInView: inView(date),
        menuOpen: Boolean(document.querySelector(".erpDropMenu")),
        product: (products?.getAttribute("title") || products?.textContent || "").trim(),
      };
      if (wrap) wrap.scrollLeft = Math.max(0, (wrap.scrollWidth || 0) - (wrap.clientWidth || 0));
      await new Promise((r) => setTimeout(r, 50));
      return {
        ...before,
        afterScrollMenuInView: inView(menu),
        afterScrollDateInView: inView(date),
        afterScrollDoc: document.documentElement.scrollWidth,
      };
    })()`);
    console.log("writeoffs 390", metrics);
    if (metrics.docScroll > metrics.client + 2 || metrics.afterScrollDoc > metrics.client + 2) {
      throw new Error(`page stretched: scrollWidth ${metrics.docScroll}/${metrics.afterScrollDoc} > client ${metrics.client}`);
    }
    if (metrics.wrapScroll <= metrics.wrapClient) {
      throw new Error(`inner table did not overflow (wrap ${metrics.wrapClient} / table ${metrics.tableW})`);
    }
    if (!metrics.menuInView) throw new Error(`row actions not reachable, menuRight=${metrics.menuRight}`);
    if (!metrics.dateInView) throw new Error("date column not visible");
    if (!metrics.product.includes("UI Very Long Writeoff")) throw new Error(`write-off product not in row: ${metrics.product}`);
    if (!metrics.menuOpen) throw new Error("row action menu did not open");
    if (!metrics.afterScrollMenuInView) throw new Error("row actions lost after inner table scroll");
    if (!metrics.afterScrollDateInView) throw new Error("date column lost after inner table scroll");

    console.log("stock-docs-ui-scenario ok");
  } finally {
    page?.close();
    killTree(chrome);
    killTree(child);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
