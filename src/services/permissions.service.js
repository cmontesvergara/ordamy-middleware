import { SSO_BACKEND_URL, APP_ID } from "../config/env.js";

/**
 * Fetches permissions from SSO Core for a given role
 * @param {string} accessToken - The JWT access token
 * @param {string} roleName - The role name to fetch permissions for
 * @returns {Promise<Array>} Array of permissions
 */
export async function fetchPermissionsFromSSO(accessToken, roleName) {
    try {
        const url = `${SSO_BACKEND_URL}/api/v2/role/${encodeURIComponent(roleName)}/permission?appId=${APP_ID}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
            console.error(`[Ordamy] SSO Core returned ${response.status} for role ${roleName}`);
            return [];
        }
        
        const data = await response.json();
        const allPerms = data.permissions || [];
        
        // Filter permissions for this specific app
        return allPerms.filter(p => p.appId === APP_ID);
    } catch (error) {
        console.error("[Ordamy] Failed to fetch permissions from SSO Core:", error.message);
        return [];
    }
}
