import Redis from "ioredis";
import { 
    REDIS_HOST, 
    REDIS_PASSWORD, 
    REDIS_PORT 
} from "./env.js";

/**
 * Redis client instance
 * Configured with auto-reconnection and error handling
 */
let redis = null;
let isConnected = false;

/**
 * Initialize Redis connection
 * @returns {Redis|null} Redis client or null if not configured
 */
export function initRedis() {
    if (!REDIS_HOST) {
        console.log("[Redis] REDIS_HOST not configured, cache disabled");
        return null;
    }

    if (redis) {
        return redis;
    }

    try {
        const options = {
            host: REDIS_HOST,
            port: REDIS_PORT,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        };

        if (REDIS_PASSWORD) {
            options.password = REDIS_PASSWORD;
        }

        redis = new Redis(options);

        redis.on("connect", () => {
            console.log("[Redis] Connected successfully");
            isConnected = true;
        });

        redis.on("error", (err) => {
            console.error("[Redis] Connection error:", err.message);
            isConnected = false;
        });

        redis.on("close", () => {
            console.warn("[Redis] Connection closed");
            isConnected = false;
        });

        redis.on("reconnecting", () => {
            console.log("[Redis] Reconnecting...");
        });

        return redis;
    } catch (error) {
        console.error("[Redis] Failed to initialize:", error.message);
        return null;
    }
}

/**
 * Get Redis client instance
 * Initializes if not already done
 * @returns {Redis|null}
 */
export function getRedis() {
    if (!redis) {
        return initRedis();
    }
    return redis;
}

/**
 * Check if Redis is connected and ready
 * @returns {boolean}
 */
export function isRedisReady() {
    return redis !== null && isConnected && redis.status === "ready";
}

/**
 * Graceful shutdown - close Redis connection
 */
export async function closeRedis() {
    if (redis) {
        await redis.quit();
        redis = null;
        isConnected = false;
        console.log("[Redis] Connection closed gracefully");
    }
}

// Initialize on module load
initRedis();

export default redis;
