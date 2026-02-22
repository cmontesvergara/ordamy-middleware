const axios = require("axios");
const { SSO_BACKEND_URL } = require("../config/env");

class SsoService {
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
}

module.exports = new SsoService();
