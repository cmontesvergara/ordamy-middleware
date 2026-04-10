import Redis from "ioredis";
import { 
    REDIS_HOST, 
    REDIS_PASSWORD, 
    REDIS_PORT 
} from "./env.js";

/**
 * Redis client instance
 * Configured with auto-reconnection and error handling
 * Aligned with sso-core implementation pattern
 */
let redisInstance = null;

/**
 * Initialize Redis connection
 * Creates client and verifies connection with ping
 * @returns {Redis|null} Redis client or null if not configured
 */
export function initRedis() {
    if (!REDIS_HOST) {
        console.log("[Redis] REDIS_HOST not configured, cache disabled");
        return null;
    }

    if (redisInstance) {
        return redisInstance;
    }

    try {
        const options = {
            host: REDIS_HOST,
            port: REDIS_PORT,
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            // Note: lazyConnect is false by default (same as sso-core)
        };

        if (REDIS_PASSWORD) {
            options.password = REDIS_PASSWORD;
        }

        redisInstance = new Redis(options);

        redisInstance.on("error", (err) => {
            console.error("[Redis] Connection error:", err.message);
        });

        redisInstance.on("connect", () => {
            console.log("[Redis] Connected");
        });

        redisInstance.on("ready", () => {
            console.log("[Redis] Ready");
        });

        redisInstance.on("close", () => {
            console.warn("[Redis] Connection closed");
        });

        redisInstance.on("reconnecting", () => {
            console.log("[Redis] Reconnecting...");
        });

        return redisInstance;
    } catch (error) {
        console.error("[Redis] Failed to initialize:", error.message);
        return null;
    }
}

/**
 * Initialize Redis and verify connection with ping
 * Call this at application startup
 * @returns {Promise<boolean>} true if Redis is ready, false otherwise
 */
export async function initRedisWithPing() {
    const redis = initRedis();
    if (!redis) {
        return false;
    }

    try {
        await redis.ping();
        console.log("[Redis] Initialized successfully");
        return true;
    } catch (error) {
        console.error("[Redis] Failed to ping:", error.message);
        return false;
    }
}

/**
 * Get Redis client instance
 * Initializes if not already done
 * @returns {Redis|null}
 */
export function getRedis() {
    if (!redisInstance) {
        return initRedis();
    }
    return redisInstance;
}

/**
 * Check if Redis is connected and ready
 * Aligned with sso-core: checks status === 'ready'
 * @returns {boolean}
 */
export function isRedisReady() {
    return redisInstance !== null && redisInstance.status === "ready";
}

/**
 * Graceful shutdown - close Redis connection
 */
export async function closeRedis() {
    if (redisInstance) {
        await redisInstance.quit();
        redisInstance = null;
        console.log("[Redis] Disconnected");
    }
}

// Initialize on module load (creates instance but doesn't block)
initRedis();

export default redisInstance;
