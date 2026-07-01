"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PosterTestLoginScreen } from "@/components/poster-test/PosterTestLoginScreen";
import { usePosterTestAuth } from "@/components/poster-test/PosterTestAuthProvider";
import { formatVnd } from "@/lib/poster/posterTestCartHelpers";
import {
  POSTER_TEST_FOOD_PATH,
  POSTER_TEST_ROOT,
  posterTestUserPath,
} from "@/lib/posterTestRoutes";
import { cn } from "@/lib/utils";

type AccountTab = "profile" | "bonuses" | "orders" | "beer-club";

type OrderSummary = {
  id: string;
  status: string;
  fulfillment: string;
  totalVnd: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
};

const TAB_ITEMS: Array<{ id: AccountTab; label: string; icon: string }> = [
  { id: "profile", label: "Профиль", icon: "👤" },
  { id: "bonuses", label: "Мои бонусы", icon: "🎁" },
  { id: "orders", label: "Мои заказы", icon: "📦" },
  { id: "beer-club", label: "Beer Club", icon: "🍺" },
];

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function PosterTestAccountClient() {
  const { user, loading, signOut, refreshSession } = usePosterTestAuth();
  const [tab, setTab] = useState<AccountTab>("profile");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const qrUrl = useMemo(() => {
    if (!user || typeof window === "undefined") return "";
    return `${window.location.origin}${posterTestUserPath(user.qrSlug)}`;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setOrdersLoading(true);
    void fetch("/api/poster-test/orders", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; orders?: OrderSummary[] }) => {
        setOrders(data.success && Array.isArray(data.orders) ? data.orders : []);
      })
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-white/55">
        Загрузка кабинета...
      </div>
    );
  }

  if (!user) {
    return (
      <PosterTestLoginScreen
        returnTo="/poster-test/account"
        onSuccess={() => {
          void refreshSession();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-6 text-white">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-white/45">Личный кабинет</p>
          <h1 className="text-2xl font-semibold">{user.name}</h1>
        </div>
        <Link
          href={POSTER_TEST_ROOT}
          className="rounded-full border border-white/15 px-3 py-2 text-xs text-white/70"
        >
          Меню
        </Link>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium",
              tab === item.id
                ? "border-white bg-white text-black"
                : "border-white/20 bg-white/[0.06] text-white/80",
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "profile" ? (
        <section className="space-y-4">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <div className="flex items-center gap-4">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt=""
                  className="h-16 w-16 rounded-full border border-white/15 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10 text-2xl">
                  👤
                </div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-semibold">{user.name}</p>
                <p className="text-sm text-white/55">
                  {user.provider === "google" ? user.email : `Telegram ID ${user.telegramId}`}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-amber-200/80">
                  {user.role}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-white/45">Ваш QR</p>
            <p className="mt-2 text-sm text-white/65">
              Покажите QR сотруднику или откройте ссылку для идентификации в программе лояльности.
            </p>
            <div className="mt-4 flex justify-center rounded-2xl bg-white p-4">
              <img
                src={`/api/poster-test/qr?slug=${encodeURIComponent(user.qrSlug)}`}
                alt="Персональный QR"
                className="h-44 w-44"
              />
            </div>
            <p className="mt-3 break-all text-center text-xs text-white/45">{qrUrl}</p>
            <Link
              href={posterTestUserPath(user.qrSlug)}
              className="mt-4 block text-center text-sm text-amber-200"
            >
              Открыть страницу QR
            </Link>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm text-white/75"
          >
            Выйти
          </button>
        </section>
      ) : null}

      {tab === "bonuses" ? (
        <section className="rounded-[24px] border border-amber-300/25 bg-amber-300/10 p-6 text-center">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-100/70">Мои бонусы</p>
          <p className="mt-3 text-4xl font-semibold text-amber-200">{user.bonusPoints}</p>
          <p className="mt-2 text-sm text-white/60">бонусных баллов</p>
          <p className="mt-4 text-sm leading-6 text-white/50">
            Начисление бонусов за заказы будет подключено вместе с программой лояльности.
          </p>
        </section>
      ) : null}

      {tab === "orders" ? (
        <section className="space-y-3">
          {ordersLoading ? (
            <p className="text-sm text-white/55">Загрузка заказов...</p>
          ) : orders.length === 0 ? (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6 text-center">
              <p className="text-sm text-white/60">Заказов пока нет.</p>
              <Link href={POSTER_TEST_FOOD_PATH} className="mt-4 inline-block text-sm text-amber-200">
                Перейти в меню
              </Link>
            </div>
          ) : (
            orders.map((order) => (
              <article
                key={order.id}
                className="rounded-[24px] border border-white/10 bg-white/[0.05] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{formatDate(order.createdAt)}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/45">
                      {order.status} · {order.fulfillment}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-amber-200">
                    {formatVnd(order.totalVnd)} VND
                  </p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-white/65">
                  {order.items.map((item, index) => (
                    <li key={`${order.id}-${index}`}>
                      {item.name} × {item.quantity}
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </section>
      ) : null}

      {tab === "beer-club" ? (
        <section className="rounded-[24px] border border-white/10 bg-white/[0.05] p-6 text-center">
          <p className="text-3xl" aria-hidden="true">
            🍺
          </p>
          <h2 className="mt-3 text-lg font-semibold">Beer Club</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Раздел в разработке. Здесь появится клубная программа и специальные предложения.
          </p>
        </section>
      ) : null}
    </div>
  );
}
