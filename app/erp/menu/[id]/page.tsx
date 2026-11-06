import { DishPage } from "@/components/erp/MenuPage";

export default async function ErpDishPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  return <DishPage id={id} from={from} />;
}
