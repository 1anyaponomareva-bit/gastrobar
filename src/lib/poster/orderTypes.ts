import type { PosterFoodMenuItem } from "./mapProducts";

export type PosterTestCartItemInput = {
  id: string;
  quantity: number;
  selectedSausageId?: string;
};

export type PosterTestOrderCustomer = {
  name: string;
  phone: string;
  comment?: string;
  fulfillment: "pickup" | "table" | "delivery";
  deliveryAddress?: string;
};

export type PosterTestOrderRequest = {
  customer: PosterTestOrderCustomer;
  items: PosterTestCartItemInput[];
};

export type PosterTestOrderLine = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
};

export type PosterIncomingOrderProduct = {
  product_id: string;
  count: number;
  modification?: string;
};

export type PosterIncomingOrderPayload = {
  spot_id: number;
  phone: string;
  first_name: string;
  comment: string;
  source: "Website";
  products: PosterIncomingOrderProduct[];
};

export type PosterIncomingOrderResponse = {
  incoming_order_id?: string;
  status?: number;
  spot_id?: string;
  phone?: string | null;
  first_name?: string | null;
  comment?: string | null;
  products?: Array<{
    io_product_id?: string;
    product_id?: string;
    modificator_id?: string | null;
    count?: string;
  }>;
  [key: string]: unknown;
};

export type PosterTestValidatedOrder = {
  lines: PosterTestOrderLine[];
  posterProducts: PosterIncomingOrderProduct[];
  total: number;
};

export function findMenuItemById(
  items: PosterFoodMenuItem[],
  id: string,
): PosterFoodMenuItem | null {
  return items.find((item) => item.id === id) ?? null;
}
