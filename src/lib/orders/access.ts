/** Kitchen Order List is public, like `/staff`. Catalog edits stay admin-only. */

export const KITCHEN_ORDERS_ACTOR = "kitchen@gastrofood";

export type OrdersAccess = {
  email: string;
  erpAdmin: boolean;
  /** True when nobody signed in: shared kitchen identity, no `gf_orders` cookie. */
  public: boolean;
};

function norm(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return email.includes("@") ? email : null;
}

/**
 * Staff split: cooks use the list with no password; admin cookie is recipes-admin / ERP.
 * An old `gf_orders` employee cookie still identifies that person if present.
 */
export function resolvePublicOrdersActor(
  adminEmail: string | null | undefined,
  ordersEmail: string | null | undefined,
): OrdersAccess {
  const admin = norm(adminEmail);
  if (admin) return { email: admin, erpAdmin: true, public: false };
  const orders = norm(ordersEmail);
  if (orders) return { email: orders, erpAdmin: false, public: false };
  return { email: KITCHEN_ORDERS_ACTOR, erpAdmin: false, public: true };
}

export function isKitchenPublicActor(email: string | null | undefined): boolean {
  return norm(email) === KITCHEN_ORDERS_ACTOR;
}
