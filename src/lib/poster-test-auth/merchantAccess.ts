const DEFAULT_MERCHANT_EMAILS = ["1anyaponomareva@gmail.com"];

function getMerchantEmails(): Set<string> {
  const fromEnv =
    process.env.POSTER_TEST_MERCHANT_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? [];

  return new Set([...DEFAULT_MERCHANT_EMAILS, ...fromEnv]);
}

export function isPosterTestMerchantEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return getMerchantEmails().has(normalized);
}

export function isPosterTestMerchantUser(input: {
  role: "guest" | "staff" | "admin";
  email?: string | null;
}): boolean {
  if (input.role === "staff" || input.role === "admin") return true;
  return isPosterTestMerchantEmail(input.email);
}
