import { erpRedirect } from "@/lib/erp/erpRedirect";
import { processingDocPath } from "@/lib/erp/processing";

export default async function ErpBatchRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") qs.set(key, value);
    else if (Array.isArray(value)) for (const item of value) qs.append(key, item);
  }
  const suffix = qs.toString();
  await erpRedirect(`${processingDocPath(id)}${suffix ? `?${suffix}` : ""}`);
}
