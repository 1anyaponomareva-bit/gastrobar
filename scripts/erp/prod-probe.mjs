/** Read-only production timings. No cookies: ERP APIs should 401. */
const URLS = [
  "https://gastrofood.vn/",
  "https://gastrofood.vn/stock",
  "https://gastrofood.vn/stock/receipts",
  "https://gastrofood.vn/menu",
  "https://www.gastrofood.vn/",
  "https://www.gastrotruck.org/erp",
  "https://www.gastrotruck.org/erp/stock",
  "https://www.gastrotruck.org/erp/stock/receipts",
  "https://www.gastrotruck.org/erp/stock/transfers",
  "https://www.gastrotruck.org/erp/stock/writeoffs",
  "https://www.gastrotruck.org/erp/stock/packs",
  "https://www.gastrotruck.org/erp/stock/report",
  "https://www.gastrotruck.org/api/erp/session",
  "https://www.gastrotruck.org/api/erp/ping",
  "https://www.gastrotruck.org/api/erp/state",
  "https://www.gastrotruck.org/api/erp/state?parts=stock,products,warehouses,packs,productPacks,writeoffReasons,categories,suppliers,settings,channels",
  "https://www.gastrotruck.org/api/erp/state?parts=recipes,dishes",
  "https://www.gastrotruck.org/api/erp/documents",
  "https://www.gastrotruck.org/api/erp/documents?type=transfer",
  "https://www.gastrotruck.org/api/erp/receipts",
  "https://www.gastrotruck.org/api/erp/writeoffs",
  "https://www.gastrotruck.org/api/erp/product-receipts?product=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "https://www.gastrotruck.org/api/erp/report?from=2026-01-01&to=2026-12-31",
];

const header = (res, name) => res.headers.get(name);

async function probe(url, n) {
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store", redirect: "manual", headers: { "cache-control": "no-store" } });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    n,
    ms: Math.round(performance.now() - t0),
    status: res.status,
    bytes: buf.length,
    serverTiming: header(res, "server-timing"),
    vercelId: header(res, "x-vercel-id"),
    vercelCache: header(res, "x-vercel-cache"),
    cfRay: header(res, "cf-ray"),
    url,
    body: buf.subarray(0, 180).toString("utf8").replace(/\s+/g, " "),
  };
}

for (const url of URLS) {
  for (let n = 1; n <= 3; n += 1) {
    try {
      console.log(JSON.stringify(await probe(url, n)));
    } catch (error) {
      console.log(JSON.stringify({ n, url, error: String(error) }));
    }
  }
}
