import { NextResponse } from "next/server";
import { getPosterApiToken } from "@/lib/poster/client";
import { createPosterTestOrder } from "@/lib/poster/orderService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!getPosterApiToken()) {
    return NextResponse.json(
      {
        success: false,
        error: "TOKEN_NOT_FOUND",
        message: "Poster API token is not configured.",
      },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_JSON",
        message: "Некорректный формат заказа.",
      },
      { status: 400 },
    );
  }

  try {
    const created = await createPosterTestOrder(body);
    return NextResponse.json({
      success: true,
      message: "Заказ успешно отправлен.",
      ...created,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: "POSTER_ORDER_FAILED",
        message: err instanceof Error ? err.message : "Poster вернул ошибку при создании заказа.",
      },
      { status: 400 },
    );
  }
}
