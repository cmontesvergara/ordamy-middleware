import { createSsoAuthRouter  } from "@bigso/auth-sdk/express";
import { ssoClient  } from "../config/ssoClient.js";
import { COOKIE_NAME, COOKIE_DOMAIN, NODE_ENV, FRONTEND_URL  } from "../config/env.js";

export default createSsoAuthRouter({
    ssoClient,
    frontendUrl: FRONTEND_URL,
    cookieName: COOKIE_NAME,
    cookieDomain: COOKIE_DOMAIN,
    isProduction: NODE_ENV === "production",
    onLoginSuccess: (session) => {
        console.log(`✅ [Ordamy] User ${session.user.email} logged in successfully via SSO.`);
    },
    onLogout: (sessionToken) => {
        console.log(`👋 [Ordamy] User logged out.`);
    }
});
