const ssoService = require("../services/sso.service");
const { COOKIE_NAME, APP_ID } = require("../config/env");

/**
 * Express middleware to validate SSO sessions based on cookies.
 * It will attach req.user, req.tenant, and req.ssoSession if valid.
 */
async function ssoAuthMiddleware(req, res, next) {
    try {
        const sessionToken = req.cookies[COOKIE_NAME];

        if (!sessionToken) {
            return res.status(401).json({ error: "No session found in cookies" });
        }

        const session = await ssoService.validateSessionToken(sessionToken, APP_ID);

        if (!session) {
            // Clear invalid cookie
            res.clearCookie(COOKIE_NAME);
            return res.status(401).json({ error: "Session expired or invalid" });
        }

        // Attach data to request
        req.user = session.user;
        req.tenant = session.tenant;
        req.ssoSession = session;

        next();
    } catch (error) {
        console.error("❌ Authentication Middleware Error:", error.message);
        res.status(500).json({ error: "Internal authentication error" });
    }
}

module.exports = ssoAuthMiddleware;
