/**
 * ACCOUNT → SIGN-IN
 *
 * Who is signed in, and the ways to act on it. Signed out, a single Sign in
 * row opens the shared sign-in sheet; signed in, the identity (name, email,
 * provider) is shown with Sign out and, when the page supplies a handler,
 * Delete account. Renders nothing while accounts are switched off.
 *
 * This is the only place the email is shown anywhere in the app.
 */

import React from "react";
import { useAuth } from "../../core/context/AuthContext";
import { useLang } from "../../core/context/LanguageContext";

const PROVIDER_LABEL = { google: "Google", apple: "Apple" } as const;

interface AccountIdentityRowProps {
  /** Opens the delete-account flow. The Delete row is hidden without it. */
  onDelete?: () => void;
}

const AccountIdentityRow: React.FC<AccountIdentityRowProps> = ({ onDelete }) => {
  const { t } = useLang();
  const ta = t.account;
  const { enabled, user, requestSignIn, signOut } = useAuth();

  if (!enabled) return null;

  return (
    <>
      <p className="ac-section-label">{ta.sectionTitle}</p>
      <div className="ac-group">
        {user ? (
          <>
            <div className="ac-row ac-row--static">
              <span className="ac-row-label">
                {user.name && <span className="ac-identity-name">{user.name}</span>}
                {user.email && <span className="ac-identity-email">{ta.signedInAs(user.email)}</span>}
                {!user.name && !user.email && (
                  <span className="ac-identity-name">{PROVIDER_LABEL[user.provider]}</span>
                )}
              </span>
              <span className="ac-plan-pill">{PROVIDER_LABEL[user.provider]}</span>
            </div>
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
                <button className="ac-row" onClick={onDelete}>
                  <span className="ac-row-label">{ta.deleteAccount}</span>
                  <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </>
            )}
          </>
        ) : (
          <button className="ac-row" onClick={() => void requestSignIn()}>
            <span className="ac-row-label">{ta.signIn}</span>
            <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
};

export default AccountIdentityRow;
