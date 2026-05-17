import React, { useEffect, useRef } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { exchangeCodeForToken } from "./oauth.service";

const AuthCallback: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const attempted = useRef(false);

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
      .then(() => history.replace("/account"))
      .catch((err) => {
        console.error("[AuthCallback] token exchange failed:", err);
        history.replace("/account?error=auth_failed");
      });
  }, []);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
      }}
    >
      Authenticating…
    </div>
  );
};

export default AuthCallback;
