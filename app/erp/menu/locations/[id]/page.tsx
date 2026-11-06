import { MenuLocationEditPage } from "@/components/erp/MenuLocationsPage";

export default async function ErpMenuLocationEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MenuLocationEditPage id={id} />;
}
