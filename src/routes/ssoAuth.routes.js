const { createSsoAuthRouter } = require("@bigso/auth-sdk/express");
const { ssoClient } = require("../config/ssoClient");
const { COOKIE_NAME, COOKIE_DOMAIN, NODE_ENV, FRONTEND_URL } = require("../config/env");

module.exports = createSsoAuthRouter({
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
