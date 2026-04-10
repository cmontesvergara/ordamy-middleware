import { getRedis, isRedisReady } from "../config/redis.js";
import { PERMISSIONS_CACHE_TTL, APP_ID } from "../config/env.js";

/**
 * Build cache key for permissions
 * Format: permissions:{roleName}:{appId}:{tenantId}
 * 
 * @param {string} roleName - The role name
 * @param {string} appId - The application ID
 * @param {string} tenantId - The tenant ID (SSO ID)
 * @returns {string} Cache key
 */
export function buildCacheKey(roleName, appId, tenantId) {
    return `permissions:${roleName}:${appId}:${tenantId}`;
}

/**
 * Check if Redis cache is available and ready
 * @returns {boolean}
 */
export function isCacheAvailable() {
    return isRedisReady();
}

/**
 * Get permissions from Redis cache
 * 
 * @param {string} roleName - The role name
 * @param {string} appId - The application ID  
 * @param {string} tenantId - The tenant ID
 * @returns {Promise<Array|null>} Cached permissions or null if miss/error
 */
export async function getPermissionsFromCache(roleName, appId, tenantId) {
    try {
        if (!isRedisReady()) {
            return null;
        }

        const redis = getRedis();
        if (!redis) {
            return null;
        }

        const key = buildCacheKey(roleName, appId, tenantId);
        const cached = await redis.get(key);

        if (!cached) {
            return null;
        }

        const permissions = JSON.parse(cached);
        console.log(`[Cache] Hit for role: ${roleName}, tenant: ${tenantId}`);
        return permissions;
    } catch (error) {
        // Silent fail - log warning and return null (will fetch from SSO)
        console.warn(`[Cache] Error reading from Redis: ${error.message}`);
        return null;
    }
}

/**
 * Save permissions to Redis cache with TTL
 * 
 * @param {string} roleName - The role name
 * @param {string} appId - The application ID
 * @param {string} tenantId - The tenant ID  
 * @param {Array} permissions - Permissions array to cache
 * @returns {Promise<void>}
 */
export async function setPermissionsInCache(roleName, appId, tenantId, permissions) {
    try {
        if (!isRedisReady()) {
            console.warn(`[Cache] Redis not ready, skipping cache save`);
            return;
        }

        const redis = getRedis();
        if (!redis) {
            return;
        }

        const key = buildCacheKey(roleName, appId, tenantId);
        const ttl = PERMISSIONS_CACHE_TTL;
        
        await redis.setex(key, ttl, JSON.stringify(permissions));
        console.log(`[Cache] Saved permissions for role: ${roleName}, tenant: ${tenantId} (TTL: ${ttl}s)`);
    } catch (error) {
        // Silent fail - log warning but don't throw
        console.warn(`[Cache] Error saving to Redis: ${error.message}`);
    }
}

/**
 * Get cache statistics (for monitoring/debugging)
 * 
 * @returns {Promise<Object>} Cache stats
 */
export async function getCacheStats() {
    try {
        if (!isRedisReady()) {
            return { status: "disconnected", keys: 0 };
        }

        const redis = getRedis();
        if (!redis) {
            return { status: "unavailable", keys: 0 };
        }

        // Count keys matching permissions pattern
        const keys = await redis.keys("permissions:*");
        
        return {
            status: "connected",
            keys: keys.length,
            pattern: "permissions:*"
        };
    } catch (error) {
        console.warn(`[Cache] Error getting stats: ${error.message}`);
        return { status: "error", error: error.message };
    }
}
