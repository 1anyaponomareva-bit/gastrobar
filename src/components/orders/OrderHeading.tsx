type Props = {
  supplierName: string;
  docNo: string;
  warehouseName?: string | null;
  as?: "h2" | "div";
};

/** Kitchen list/detail title: supplier bold first, order number second, warehouse muted. */
export function OrderHeading({ supplierName, docNo, warehouseName, as: Tag = "div" }: Props) {
  return (
    <div className="orders-headingBlock">
      <Tag className="orders-heading">
        <span className="orders-headingSupplier">{supplierName || "—"}</span>
        {docNo ? <span className="orders-headingDoc">{docNo}</span> : null}
      </Tag>
      {warehouseName ? <div className="orders-meta">{warehouseName}</div> : null}
    </div>
  );
}
