/**
 * ACCOUNT → SIGN-IN
 *
 * Who is signed in, and the ways to act on it. Signed out, the card says what
 * an account is for and opens the shared sign-in sheet; signed in, it shows the
 * identity (initial, name, email, provider), the sync status for Pro accounts,
 * then Sign out and, when the page supplies a handler, Delete account.
 * Renders nothing in a build without sign-in configured.
 *
 * This is the only place the email is shown anywhere in the app.
 */

import React from "react";
import { useAuth } from "../../core/context/AuthContext";
import { useLang } from "../../core/context/LanguageContext";
import { useSync } from "../../core/context/SyncContext";

const PROVIDER_LABEL = { google: "Google", apple: "Apple" } as const;

/** "just now", then minutes, hours and days ago, in the app language. */
function relativeTime(iso: string, lang: string, justNow: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  // Also covers an unparsable time (NaN), which reads as "just now".
  if (!(minutes >= 1)) return justNow;
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "en", { numeric: "auto" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), "hour");
  return rtf.format(-Math.round(minutes / 1440), "day");
}

interface AccountIdentityRowProps {
  /** Opens the delete-account flow. The Delete row is hidden without it. */
  onDelete?: () => void;
}

const AccountIdentityRow: React.FC<AccountIdentityRowProps> = ({ onDelete }) => {
  const { t, lang } = useLang();
  const ta = t.account;
  const { enabled, user, requestSignIn, signOut } = useAuth();
  const { active: syncActive, status: syncStatus, lastSyncedAt, syncNow } = useSync();

  if (!enabled) return null;

  if (!user) {
    return (
      <>
        <p className="ac-section-label">{ta.sectionTitle}</p>
        <section className="ac-card ac-acct">
          <div className="ac-acct-head">
            <span className="ac-acct-avatar ac-acct-avatar--empty" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </span>
            <div className="ac-acct-text">
              <h2 className="ac-acct-title">{ta.signedOutTitle}</h2>
              <p className="ac-acct-line">{ta.signedOutLine}</p>
            </div>
          </div>
          <button className="ac-acct-cta" onClick={() => void requestSignIn()}>
            {ta.signIn}
          </button>
        </section>
      </>
    );
  }

  const displayName = user.name || user.email || PROVIDER_LABEL[user.provider];
  // Before the first run of a session the status can still read "off" while active.
  const syncState =
    syncStatus === "offline" || syncStatus === "error"
      ? syncStatus
      : syncStatus !== "syncing" && lastSyncedAt
        ? "synced"
        : "syncing";
  const syncLabel =
    syncState === "offline"
      ? ta.syncOffline
      : syncState === "error"
        ? ta.syncError
        : syncState === "synced"
          ? ta.syncSynced(relativeTime(lastSyncedAt!, lang, ta.syncJustNow))
          : ta.syncSyncing;

  return (
    <>
      <p className="ac-section-label">{ta.sectionTitle}</p>
      <section className="ac-card ac-acct">
        <div className="ac-acct-head">
          <span className="ac-acct-avatar" aria-hidden="true">
            {Array.from(displayName)[0]?.toLocaleUpperCase()}
          </span>
          <div className="ac-acct-text">
            <p className="ac-acct-name">{displayName}</p>
            {user.name && user.email && <p className="ac-acct-email">{user.email}</p>}
          </div>
          <span className="ac-plan-pill">{PROVIDER_LABEL[user.provider]}</span>
        </div>

        {syncActive && (
          <button
            className={`ac-acct-sync ac-acct-sync--${syncState}`}
            onClick={syncNow}
            disabled={syncState === "syncing"}
          >
            <span className="ac-acct-sync-dot" aria-hidden="true" />
            <span className="ac-acct-sync-label">{syncLabel}</span>
            <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><polyline points="3 21 3 16 8 16" />
              <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><polyline points="21 3 21 8 16 8" />
            </svg>
          </button>
        )}

        <div className="ac-row-divider" />
        <button className="ac-row" onClick={() => void signOut()}>
          <span className="ac-row-label">{ta.signOut}</span>
          <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
        {onDelete && (
          <>
            <div className="ac-row-divider" />
            <button className="ac-row ac-row--quiet" onClick={onDelete}>
              <span className="ac-row-label">{ta.deleteAccount}</span>
              <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </button>
          </>
        )}
      </section>
    </>
  );
};

export default AccountIdentityRow;
