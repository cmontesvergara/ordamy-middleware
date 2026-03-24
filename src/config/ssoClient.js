import { BigsoSsoClient } from "@bigso/auth-sdk/node";
import { SSO_BACKEND_URL, APP_ID, SSO_JWKS_URL } from "./env.js";

export const ssoClient = new BigsoSsoClient({
    ssoBackendUrl: SSO_BACKEND_URL,
    ssoJwksUrl: SSO_JWKS_URL,
    appId: APP_ID,
});
