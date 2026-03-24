const { BigsoSsoClient } = require("@bigso/auth-sdk/node");
const { SSO_BACKEND_URL, APP_ID, SSO_JWKS_URL } = require("./env");

const ssoClient = new BigsoSsoClient({
    ssoBackendUrl: SSO_BACKEND_URL,
    ssoJwksUrl: SSO_JWKS_URL,
    appId: APP_ID,
});

module.exports = { ssoClient };
