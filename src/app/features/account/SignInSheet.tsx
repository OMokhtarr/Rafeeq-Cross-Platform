/**
 * SIGN-IN SHEET
 *
 * Bottom sheet any gated action raises through `useAuth().requestSignIn()`.
 * Rendered once at the app root (inside the router). Google is always
 * offered; Apple only where it is switched on. A cancelled provider prompt
 * leaves the sheet as it was, a failure says so; success needs nothing here,
 * since AuthProvider settles the pending request and closes the sheet.
 */

import React, { useEffect, useRef, useState } from "react";
import { useIonToast } from "@ionic/react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../core/context/AuthContext";
import { useLang } from "../../core/context/LanguageContext";
import { isAppleSignInOn } from "../../core/services/auth/accounts-switch";
import { AuthProviderId } from "../../core/services/auth/auth.service";
import { registerOverlay } from "../../core/utils/overlay-registry";
import "./SignInSheet.css";

const SignInSheet: React.FC = () => {
  const { signInOpen, signIn, closeSignIn } = useAuth();
  const { t } = useLang();
  const [presentToast] = useIonToast();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);

  // Android Back and the edge swipe close the topmost registered overlay first.
  useEffect(
    () => (signInOpen ? registerOverlay(closeSignIn) : undefined),
    [signInOpen, closeSignIn],
  );

  // The sheet belongs to the page that raised it: leaving that page closes it.
  const openedOnRef = useRef(pathname);
  useEffect(() => {
    if (!signInOpen) {
      openedOnRef.current = pathname;
      return;
    }
    if (pathname !== openedOnRef.current) closeSignIn();
  }, [signInOpen, pathname, closeSignIn]);

  if (!signInOpen) return null;
  const ta = t.account;

  const choose = async (provider: AuthProviderId) => {
    if (busy) return;
    setBusy(true);
    try {
      if ((await signIn(provider)) === "failed") {
        presentToast({ message: ta.signInFailed, duration: 2500, position: "bottom" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin-layer" dir={t.dir}>
      <div className="signin-backdrop" onClick={closeSignIn} />
      <div className="signin-sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <button type="button" className="signin-close" onClick={closeSignIn} aria-label={t.mushaf.closeLabel}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <h2 id="signin-title" className="signin-title">
          {ta.signInTitle}
        </h2>
        <p className="signin-why">{ta.signInWhy}</p>
        <button type="button" className="signin-provider" disabled={busy} onClick={() => void choose("google")}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.1a4.4 4.4 0 01-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7z" fill="#4285F4" />
            <path d="M12 21.5c2.6 0 4.7-.9 6.3-2.3l-3.1-2.4c-.9.6-2 .9-3.2.9-2.5 0-4.6-1.7-5.3-3.9H3.5v2.5A9.5 9.5 0 0012 21.5z" fill="#34A853" />
            <path d="M6.7 13.8a5.7 5.7 0 010-3.6V7.7H3.5a9.5 9.5 0 000 8.6l3.2-2.5z" fill="#FBBC05" />
            <path d="M12 6.3c1.4 0 2.7.5 3.7 1.4l2.7-2.7A9.5 9.5 0 003.5 7.7l3.2 2.5C7.4 8 9.5 6.3 12 6.3z" fill="#EA4335" />
          </svg>
          <span>{ta.continueGoogle}</span>
        </button>
        {isAppleSignInOn() && (
          <button type="button" className="signin-provider" disabled={busy} onClick={() => void choose("apple")}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.8-2.2.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.900zM14.2 5.800c.6-.8 1.1-1.9.9-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.5 2.8-1.300z"
              />
            </svg>
            <span>{ta.continueApple}</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default SignInSheet;
