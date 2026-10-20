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

/** The RevenueCat app-user id the broker checks the subscription against.
 *  Set by the SubscriptionProvider once RevenueCat reports it; null on web
 *  and before RevenueCat answers. */
let brokerUserId: string | null = null;

export function setBrokerUserId(id: string | null): void {
  brokerUserId = id;
}

/** Headers every broker speech request carries. */
export function brokerHeaders(): Record<string, string> {
  return brokerUserId ? { "x-rafeeq-user": brokerUserId } : {};
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
  const res = await fetch(brokerUrl(path), { method: "POST", headers: brokerHeaders() });
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
