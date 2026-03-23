const axios = require("axios");
const { SSO_BACKEND_URL, SSO_JWKS_URL } = require("../config/env");

// jose is ESM-only, so we use dynamic import
let _jose = null;
async function getJose() {
    if (!_jose) {
        _jose = await import("jose");
    }
    return _jose;
}

class SsoService {
    /**
     * Verify a signed payload (JWS) against the SSO's JWKS
     * @param {string} token - The compact JWS token
     * @param {string} expectedAudience - The expected audience (app origin)
     * @returns {Promise<object>} The verified payload
     */
    async verifySignedPayload(token, expectedAudience) {
        const { jwtVerify, createRemoteJWKSet } = await getJose();
        const JWKS = createRemoteJWKSet(new URL(SSO_JWKS_URL));

        const { payload } = await jwtVerify(token, JWKS, {
            audience: expectedAudience,
        });

        return payload;
    }

    /**
     * Validate session token with SSO Backend
     * @param {string} sessionToken - JWT token from cookie
     * @param {string} appId - Application ID for validation
     * @returns {Promise<object|null>} Session data or null if invalid
     */
    async validateSessionToken(sessionToken, appId) {
        try {
            const response = await axios.post(
                `${SSO_BACKEND_URL}/api/v1/auth/verify-session`,
                {
                    sessionToken,
                    appId,
                },
                {
                    timeout: 5000,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (response.data.valid) {
                return {
                    user: response.data.user,
                    tenant: response.data.tenant,
                    appId: response.data.appId,
                    expiresAt: response.data.expiresAt,
                };
            }
            return null;
        } catch (error) {
            console.error("❌ Error validating session:", error.message);
            return null;
        }
    }

    /**
     * Exchange authorization code for session token from SSO
     * @param {string} code - The auth code
     * @param {string} appId - Application ID
     * @returns {Promise<object>} The SSO exchange response
     */
    async exchangeCodeForToken(code, appId) {
        const response = await axios.post(
            `${SSO_BACKEND_URL}/api/v1/auth/token`,
            {
                authCode: code,
                appId,
            },
            {
                timeout: 10000,
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return response.data;
    }

    /**
     * Revoke session in SSO backend
     * @param {string} sessionToken - The active session token
     * @returns {Promise<void>}
     */
    async revokeSession(sessionToken) {
        await axios.post(
            `${SSO_BACKEND_URL}/api/v1/session/revoke`,
            {},
            {
                timeout: 5000,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${sessionToken}`,
                },
            }
        );
    }

    /**
     * Refreshes the application session using a refresh token
     * @param {string} refreshToken - The stored refresh token
     * @param {string} appId - Application ID
     * @returns {Promise<object|null>} The new session tokens or null if failed
     */
    async refreshAppSession(refreshToken, appId) {
        try {
            const response = await axios.post(
                `${SSO_BACKEND_URL}/api/v1/auth/app-refresh`,
                {
                    refreshToken,
                    appId,
                },
                {
                    timeout: 5000,
                    headers: {
                        "Content-Type": "application/json",
                    },
                }
            );

            if (response.data.success) {
                return {
                    sessionToken: response.data.sessionToken,
                    refreshToken: response.data.refreshToken,
                    expiresAt: response.data.expiresAt,
                    refreshExpiresAt: response.data.refreshExpiresAt,
                };
            }
            return null;
        } catch (error) {
            console.error("❌ Error refreshing app session:", error.response?.data || error.message);
            return null;
        }
    }
}

module.exports = new SsoService();
