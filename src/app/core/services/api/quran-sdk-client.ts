import { QuranClient, Language } from "@quranjs/api";

const CLIENT_ID = process.env.REACT_APP_QF_CLIENT_ID;
const CLIENT_SECRET = process.env.REACT_APP_QF_CLIENT_SECRET;

// Check credentials and warn if missing
const hasCredentials = !!CLIENT_ID && !!CLIENT_SECRET;
if (!hasCredentials) {
  console.warn(
    "⚠️  Quran Foundation credentials are missing.\n" +
      "   Set REACT_APP_QF_CLIENT_ID and REACT_APP_QF_CLIENT_SECRET in your .env file.\n" +
      "   The app will start, but Quran content will not be available.",
  );
}

/**
 * Create a real QuranClient if credentials exist; otherwise return a mock that
 * throws helpful errors when methods are called.
 */
function createClient(): QuranClient {
  if (hasCredentials) {
    return new QuranClient({
      clientId: CLIENT_ID!,
      clientSecret: CLIENT_SECRET!,
      defaults: {
        language: Language.ENGLISH,
        wordFields: ["code_v2", "text_uthmani", "line_number", "page_number"],
      },
    });
  }

  // Return a proxy that throws an error for any method call.
  return new Proxy({} as QuranClient, {
    get(target, prop) {
      return (...args: any[]) =>
        Promise.reject(
          new Error(
            `QuranClient.${String(prop)}() cannot be called: missing credentials.\n` +
              `Please set REACT_APP_QF_CLIENT_ID and REACT_APP_QF_CLIENT_SECRET.`,
          ),
        );
    },
  });
}

export function isSdkAvailable(): boolean {
  return (
    !!process.env.REACT_APP_QF_CLIENT_ID &&
    !!process.env.REACT_APP_QF_CLIENT_SECRET
  );
}

// NOTE on search: the SDK's `client.search.search(...)` calls
// oauth2.quran.foundation/oauth2/token directly, which is blocked by CORS
// from the browser. We deliberately do NOT expose a `searchQuran` method
// on this client — the data-provider's `trySdkOrFallback` will skip past
// the SDK and hit the fallback in quran-api.client.ts, which routes
// through our token broker on the same v1 path the SDK uses internally.
export const quranClient = createClient();
