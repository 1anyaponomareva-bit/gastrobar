import { RecipePage } from "@/components/erp/PrepsPage";

export default async function ErpRecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  return <RecipePage id={id} from={from} />;
}
