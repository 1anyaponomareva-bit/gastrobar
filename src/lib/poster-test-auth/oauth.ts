const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

export function buildGoogleAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string | null {
  const { clientId, configured } = getGoogleOAuthConfig();
  if (!configured) return null;

  const search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: params.state,
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${search.toString()}`;
}

export async function exchangeGoogleCode(input: {
  code: string;
  redirectUri: string;
}): Promise<{ email: string; name: string; avatar: string | null } | null> {
  const { clientId, clientSecret, configured } = getGoogleOAuthConfig();
  if (!configured) return null;

  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenResponse.ok) return null;
  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) return null;

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!profileResponse.ok) return null;

  const profile = (await profileResponse.json()) as {
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!profile.email) return null;
  return {
    email: profile.email,
    name: profile.name?.trim() || profile.email,
    avatar: profile.picture ?? null,
  };
}

export function getTelegramBotUsername(): string | null {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";
  return username || null;
}

export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  return token || null;
}
