import { cookies } from "next/headers";
import { erpLocalMode } from "@/lib/erp/localDb";
import {
  actorDisplayName,
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
import { isValidPersonName, normalizePersonName } from "@/lib/orders/person";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export async function GET(request: Request) {
  const timing = new ServerTiming();
  try {
    const actor = await timing.time("auth", () => requireOrdersActor(request));
    const name = actor.public ? null : await timing.time("name", () => actorDisplayName(actor.email));
    return timing.json({
      email: actor.email,
      name,
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
      return timing.json({ email, name: normalizePersonName(body.name) || null, erpAdmin: false, employee: true });
    }

    const name = normalizePersonName(body.name);
    if (invite) {
      if (!isValidOrdersInvite(invite)) throw new ErpHttpError(403, "ERP_FORBIDDEN", "invite");
      if (password.length < 6) throw new ErpHttpError(400, "ERP_INVALID", "password");
      if (!isValidPersonName(name)) throw new ErpHttpError(400, "ERP_INVALID", "name");
      const [staff, admins] = await Promise.all([readOrderStaff(), readAdmins()]);
      if (staff.some((account) => account.email === email) || admins.some((account) => account.email === email)) {
        throw new ErpHttpError(409, "ERP_DUPLICATE", "email");
      }
      await writeOrderStaff([...staff, { email, name, ...hashPassword(password), createdAt: new Date().toISOString() }]);
      (await cookies()).set(ORDERS_COOKIE, createOrdersSessionToken(email), ordersCookieOptions);
      await rememberOrderUser(email, name);
      return timing.json({ email, name, erpAdmin: false, employee: true });
    }
    if (!password) throw new ErpHttpError(401, "auth");
    const [staff, admins] = await Promise.all([readOrderStaff(), readAdmins()]);
    const account = staff.find((row) => row.email === email) ?? admins.find((row) => row.email === email);
    if (!account || !verifyPassword(account, password)) throw new ErpHttpError(401, "auth");
    const savedName = normalizePersonName(account.name);

    (await cookies()).set(ORDERS_COOKIE, createOrdersSessionToken(email), ordersCookieOptions);
    await rememberOrderUser(email, savedName || null);
    return timing.json({ email, name: savedName, erpAdmin: false, employee: true });
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
