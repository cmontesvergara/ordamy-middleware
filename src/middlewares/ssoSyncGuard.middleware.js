const dns = require("dns").promises;
const { URL } = require("url");
const { SSO_BACKEND_URL, NODE_ENV } = require("../config/env");

/**
 * Guard middleware for the /api/sso/resources endpoint.
 * Protected by HTTPS check (unless local dev) and DNS/IP Verification.
 */
async function ssoSyncGuardMiddleware(req, res, next) {
    try {
        // 1. HTTPS Check
        const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
        if (!isSecure && NODE_ENV === "production") {
            console.warn("⚠️  Blocked non-HTTPS sync request");
            return res.status(403).json({ error: "HTTPS required" });
        }

        // 2. DNS/IP Check
        const clientIp = req.ip || req.connection.remoteAddress;

        // Allow localhost/loopback for development
        const isLoopback =
            clientIp === "::1" ||
            clientIp === "127.0.0.1" ||
            clientIp === "::ffff:127.0.0.1";

        if (NODE_ENV === "development" && isLoopback) {
            // Proceed locally
            return next();
        }

        const ssoUrl = new URL(SSO_BACKEND_URL);
        const ssoHostname = ssoUrl.hostname;

        // Resolve IPs of the SSO Backend
        const ssoIps = await dns.resolve4(ssoHostname);

        // Handle IPv6 mapped IPv4
        const cleanClientIp = clientIp.replace(/^.*:/, "");

        const isPrivateIp =
            cleanClientIp.startsWith("10.") ||
            cleanClientIp.startsWith("192.168.") ||
            (cleanClientIp.startsWith("172.") &&
                parseInt(cleanClientIp.split(".")[1], 10) >= 16 &&
                parseInt(cleanClientIp.split(".")[1], 10) <= 31);

        if (!ssoIps.includes(cleanClientIp) && !isPrivateIp) {
            console.warn(
                `⛔️ Blocked sync request from unauthorized IP: ${clientIp}`
            );
            return res.status(403).json({ error: "Unauthorized origin" });
        }

        next();
    } catch (error) {
        console.error("❌ Sync Guard Validation Error:", error.message);
        return res.status(500).json({ error: "Security validation failed" });
    }
}

module.exports = ssoSyncGuardMiddleware;
