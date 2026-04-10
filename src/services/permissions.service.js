import { SSO_BACKEND_URL, APP_ID, PERMISSIONS_CACHE_ENABLED } from "../config/env.js";
import { 
    getPermissionsFromCache, 
    setPermissionsInCache 
} from "./permissionsCache.service.js";

/**
 * Fetches permissions from SSO Core for a given role with Redis caching
 * 
 * Flow:
 * 1. Try to get from Redis cache (if enabled)
 * 2. If cache miss or Redis unavailable, fetch from SSO
 * 3. Save to Redis cache (silently, don't fail if Redis error)
 * 
 * @param {string} accessToken - The JWT access token
 * @param {string} roleName - The role name to fetch permissions for
 * @param {string} tenantId - The tenant ID (SSO ID) for cache key
 * @returns {Promise<Array>} Array of permissions
 */
export async function fetchPermissionsFromSSO(accessToken, roleName, tenantId) {
    // Input validation
    if (!roleName || !tenantId) {
        console.warn("[Ordamy] fetchPermissionsFromSSO: roleName or tenantId missing");
        return [];
    }

    // 1. Try to get from cache (if enabled)
    if (PERMISSIONS_CACHE_ENABLED) {
        try {
            const cached = await getPermissionsFromCache(roleName, APP_ID, tenantId);
            if (cached !== null) {
                return cached;
            }
            // Cache miss - will fetch from SSO
            console.log(`[Cache] Miss for role: ${roleName}, tenant: ${tenantId} - fetching from SSO`);
        } catch (cacheError) {
            // Log cache error but continue to SSO
            console.warn(`[Cache] Error reading cache: ${cacheError.message}`);
        }
    }

    // 2. Fetch from SSO
    const permissions = await fetchFromSSODirect(accessToken, roleName);

    // 3. Save to cache (silently, don't fail if cache error)
    if (PERMISSIONS_CACHE_ENABLED && permissions.length > 0) {
        try {
            await setPermissionsInCache(roleName, APP_ID, tenantId, permissions);
        } catch (cacheError) {
            // Log but don't fail the request
            console.warn(`[Cache] Error saving to cache: ${cacheError.message}`);
        }
    }

    return permissions;
}

/**
 * Direct fetch from SSO without caching
 * Used internally when cache is disabled or on cache miss
 * 
 * @param {string} accessToken - The JWT access token
 * @param {string} roleName - The role name to fetch permissions for
 * @returns {Promise<Array>} Array of permissions
 */
async function fetchFromSSODirect(accessToken, roleName) {
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

/**
 * Legacy function for backward compatibility
 * @deprecated Use fetchPermissionsFromSSO with tenantId
 */
export async function fetchPermissionsFromSSOLegacy(accessToken, roleName) {
    console.warn("[Ordamy] Deprecated: fetchPermissionsFromSSOLegacy called without tenantId. " +
                 "Permissions will not be cached. Update caller to pass tenantId.");
    return fetchFromSSODirect(accessToken, roleName);
}

// Export internal function for testing
export { fetchFromSSODirect };
