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

/** How long a speech request waits for an id RevenueCat is still fetching.
 *  Without the wait, a subscriber who taps the mic in the first moment after
 *  launch is sent without an id and refused as not subscribed. */
export const USER_ID_WAIT_MS = 3000;

/** Settles when the expected id arrives or RevenueCat gives up; null when no
 *  id is on its way (web, a build without a RevenueCat key, or already set). */
let pendingUserId: Promise<void> | null = null;
let settlePendingUserId: (() => void) | null = null;

/** Called as RevenueCat starts, so speech requests wait for the id instead of
 *  going out without one. */
export function expectBrokerUserId(): void {
  if (brokerUserId || pendingUserId) return;
  pendingUserId = new Promise((resolve) => {
    settlePendingUserId = resolve;
  });
}

/** Sets the id, or null when RevenueCat couldn't provide one; either way any
 *  request waiting for it goes ahead. */
export function setBrokerUserId(id: string | null): void {
  brokerUserId = id;
  settlePendingUserId?.();
  pendingUserId = null;
  settlePendingUserId = null;
}

/** Resolves at once unless an id is on its way; then when it arrives, or
 *  after USER_ID_WAIT_MS at most. */
export async function brokerUserIdSettled(): Promise<void> {
  if (!pendingUserId) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, USER_ID_WAIT_MS);
  });
  await Promise.race([pendingUserId, timeout]);
  clearTimeout(timer);
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
  const url = brokerUrl(path);
  await brokerUserIdSettled();
  const res = await fetch(url, { method: "POST", headers: brokerHeaders() });
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
