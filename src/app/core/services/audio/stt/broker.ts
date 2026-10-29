/**
 * TOKEN BROKER CLIENT
 *
 * The raw engine API keys must never reach the client: CRA inlines
 * REACT_APP_* values into the bundle, so a key here is extractable from any
 * installed APK. The broker holds the keys as Worker secrets and mints
 * short-lived credentials that are only needed for the handshake.
 */

/** What the user sees when the broker answers 503 (the engine is not set up). */
export const STT_UNAVAILABLE_MESSAGE = "Speech recognition is not available right now";

/** The broker's 402: speech is a Rafeeq Pro feature and this user isn't
 *  subscribed. Recite surfaces match on this exact message to open the
 *  subscriber note instead of showing an error. */
export const NOT_SUBSCRIBED_MESSAGE = "Subscription required";

/** Where the signed-in account's access token comes from; null when accounts
 *  are off or nobody is signed in. Set by the AuthProvider. */
let tokenSource: (() => Promise<string | null>) | null = null;

export function setBrokerTokenSource(source: (() => Promise<string | null>) | null): void {
  tokenSource = source;
}

/** Headers every broker speech request carries: the account's access token,
 *  which the broker checks the subscription against. Empty with no token; a
 *  source that fails counts as no token, and the broker answers 401 itself. */
export async function brokerHeaders(): Promise<Record<string, string>> {
  if (!tokenSource) return {};
  try {
    const token = await tokenSource();
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Full broker URL for `path`. The configured URL may or may not carry a
 *  trailing slash. */
export function brokerUrl(path: string): string {
  const configured = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";
  if (!configured) {
    throw new Error("Token broker is not configured");
  }
  const base = configured.replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Fetches a short-lived credential for the given engine from the broker. */
export async function fetchBrokerKey(
  path: "/deepgram/token" | "/soniox/token",
): Promise<string> {
  const url = brokerUrl(path);
  const res = await fetch(url, { method: "POST", headers: await brokerHeaders() });
  if (!res.ok) {
    throw new Error(
      res.status === 503
        ? STT_UNAVAILABLE_MESSAGE
        : res.status === 402
          ? NOT_SUBSCRIBED_MESSAGE
          : `Could not start speech recognition (${res.status})`,
    );
  }
  const { access_token: accessToken } = (await res.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error("Speech recognition token was empty");
  return accessToken;
}
