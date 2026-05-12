import React, { useEffect } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { exchangeCodeForToken } from "./oauth.service";

const AuthCallback: React.FC = () => {
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (code) {
      exchangeCodeForToken(code)
        .then(() => history.replace("/account"))
        .catch(() => history.replace("/account?error=auth_failed"));
    } else {
      history.replace("/account?error=no_code");
    }
  }, [location, history]);

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
