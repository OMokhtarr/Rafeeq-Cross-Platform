/**
 * Network reachability.
 *
 * `navigator.onLine` is only trustworthy when it returns false. A `true` value
 * merely means a network interface exists — WiFi with no internet, captive
 * portals and dead mobile data all report online. Startup used to trust it and
 * commit to hundreds of API calls that then hung on the OS TCP timeout, which
 * is why launching offline felt frozen.
 *
 * So: fast-path the reliable negative, otherwise confirm with one short probe.
 */

const PROBE_TIMEOUT_MS = 2000;

/** Cheap endpoint whose response body we never read — only reachability matters. */
const PROBE_URL =
  process.env.REACT_APP_TOKEN_BROKER_URL ??
  "https://apis.quran.foundation/content/api/v4";

/** Cached result, so a cold start probes once rather than per caller. */
let probeInflight: Promise<boolean> | null = null;

if (typeof window !== "undefined") {
  // Connectivity changed — let the next caller probe afresh.
  const invalidate = () => {
    probeInflight = null;
  };
  window.addEventListener("online", invalidate);
  window.addEventListener("offline", invalidate);
}

/**
 * Resolves true only when the network is actually usable. Never rejects, and
 * never takes longer than {@link PROBE_TIMEOUT_MS}.
 */
export function isNetworkReachable(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return Promise.resolve(false);
  }
  if (probeInflight) return probeInflight;

  probeInflight = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
      // `no-store` keeps a previously cached response from masking an outage.
      await fetch(PROBE_URL, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-store",
        signal: ctrl.signal,
      });
      // Under no-cors the response is opaque: status is always 0, so the fact
      // that it resolved at all is the signal we want.
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();

  return probeInflight;
}
