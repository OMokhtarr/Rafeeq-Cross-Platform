/**
 * TOKEN BROKER CLIENT
 *
 * The raw engine API keys must never reach the client: CRA inlines
 * REACT_APP_* values into the bundle, so a key here is extractable from any
 * installed APK. The broker holds the keys as Worker secrets and mints
 * short-lived credentials that are only needed for the handshake.
 */

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";

/** Full broker URL for `path`. TOKEN_BROKER_URL may or may not carry a
 *  trailing slash. */
export function brokerUrl(path: string): string {
  if (!TOKEN_BROKER_URL) {
    throw new Error("Token broker is not configured");
  }
  const base = TOKEN_BROKER_URL.replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Fetches a short-lived credential for the given engine from the broker. */
export async function fetchBrokerKey(
  path: "/deepgram/token" | "/soniox/token",
): Promise<string> {
  const res = await fetch(brokerUrl(path), { method: "POST" });
  if (!res.ok) {
    throw new Error(
      res.status === 503
        ? "Speech recognition is not available right now"
        : `Could not start speech recognition (${res.status})`,
    );
  }
  const { access_token: accessToken } = (await res.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error("Speech recognition token was empty");
  return accessToken;
}
