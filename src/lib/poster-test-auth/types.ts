export type PosterTestUserRole = "guest" | "staff" | "admin";

export type PosterTestAuthProvider = "google" | "telegram";

export type PosterTestUser = {
  id: string;
  name: string;
  avatar: string | null;
  email: string | null;
  telegramId: number | null;
  provider: PosterTestAuthProvider;
  role: PosterTestUserRole;
  bonusPoints: number;
  qrSlug: string;
  createdAt: string;
  updatedAt: string;
};

export type PosterTestOrderItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  selectedSausageId?: string;
  selectedSausageLabel?: string;
};

export type PosterTestOrder = {
  id: string;
  userId: string;
  status: "pending" | "confirmed" | "cancelled";
  fulfillment: "pickup" | "table" | "delivery";
  customerName: string;
  customerPhone: string;
  customerComment: string | null;
  items: PosterTestOrderItem[];
  totalVnd: number;
  posterOrderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PosterTestSessionPayload = {
  sub: string;
  exp: number;
};

export type PosterTestOAuthState = {
  returnTo: string;
  nonce: string;
};
