import React, { useEffect, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { exchangeCodeForToken } from "./oauth.service";

const AuthCallback: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const attempted = useRef(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const params = new URLSearchParams(location.search);
    const code = params.get("code");

    if (!code) {
      console.error("[AuthCallback] no code in URL params:", location.search);
      history.replace("/account?error=no_code");
      return;
    }

    exchangeCodeForToken(code)
      .then(() => {
        // Close this popup tab — the original tab picks up the token via storage event.
        // If the browser blocks window.close(), show a "you can close this tab" message.
        setDone(true);
        window.close();
      })
      .catch((err) => {
        console.error("[AuthCallback] token exchange failed:", err);
        history.replace("/account?error=auth_failed");
      });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        gap: "12px",
        fontFamily: "sans-serif",
      }}
    >
      {done ? (
        <>
          <span>Signed in successfully.</span>
          <span style={{ fontSize: "0.85em", color: "#888" }}>You can close this tab.</span>
        </>
      ) : (
        <span>Authenticating…</span>
      )}
    </div>
  );
};

export default AuthCallback;
