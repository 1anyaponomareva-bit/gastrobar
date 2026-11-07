import { cookies } from "next/headers";
import { erpLocalMode } from "@/lib/erp/localDb";
import {
  createOrdersSessionToken,
  ErpHttpError,
  jsonObject,
  ORDERS_COOKIE,
  ordersCookieOptions,
  rememberOrderUser,
  requireOrdersActor,
  ServerTiming,
} from "@/lib/erp/supplierOrders";
import {
  hashPassword,
  isValidEmail,
  isValidOrdersInvite,
  normalizeEmail,
  verifyPassword,
} from "@/lib/recipes-admin/auth";
import { readAdmins, readOrderStaff, writeOrderStaff } from "@/lib/recipes-admin/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const actor = await timing.time("auth", () => requireOrdersActor(request));
    return timing.json({
      email: actor.email,
      erpAdmin: actor.erpAdmin,
      public: actor.public,
      employee: true,
    });
  } catch (error) {
    return timing.error(error);
  }
}

/** Sets the employee cookie only. ERP admin is a different cookie and is not granted by this. */
export async function POST(request: Request) {
  const timing = new ServerTiming();
  try {
    const body = jsonObject(await request.json().catch(() => null));
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const invite = typeof body.invite === "string" ? body.invite.trim() : "";
    if (!isValidEmail(email)) throw new ErpHttpError(400, "ERP_INVALID", "email");

    if (erpLocalMode()) {
      return timing.json({ email, erpAdmin: false, employee: true });
    }

    if (invite) {
      if (!isValidOrdersInvite(invite)) throw new ErpHttpError(403, "ERP_FORBIDDEN", "invite");
      if (password.length < 6) throw new ErpHttpError(400, "ERP_INVALID", "password");
      const [staff, admins] = await Promise.all([readOrderStaff(), readAdmins()]);
      if (staff.some((account) => account.email === email) || admins.some((account) => account.email === email)) {
        throw new ErpHttpError(409, "ERP_DUPLICATE", "email");
      }
      await writeOrderStaff([...staff, { email, ...hashPassword(password), createdAt: new Date().toISOString() }]);
    } else {
      if (!password) throw new ErpHttpError(401, "auth");
      const [staff, admins] = await Promise.all([readOrderStaff(), readAdmins()]);
      const account = staff.find((row) => row.email === email) ?? admins.find((row) => row.email === email);
      if (!account || !verifyPassword(account, password)) throw new ErpHttpError(401, "auth");
    }

    (await cookies()).set(ORDERS_COOKIE, createOrdersSessionToken(email), ordersCookieOptions);
    await rememberOrderUser(email);
    return timing.json({ email, erpAdmin: false, employee: true });
  } catch (error) {
    return timing.error(error);
  }
}

export async function DELETE() {
  const timing = new ServerTiming();
  try {
    (await cookies()).set(ORDERS_COOKIE, "", { ...ordersCookieOptions, maxAge: 0 });
    return timing.json({ ok: true });
  } catch (error) {
    return timing.error(error);
  }
}
