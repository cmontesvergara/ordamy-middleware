const express = require("express");
const ssoService = require("../services/sso.service");
const ssoAuthMiddleware = require("../middlewares/ssoAuth.middleware");
const { APP_ID, COOKIE_NAME } = require("../config/env");
const router = express.Router();

/**
 * Utility to generate standard cookie options with conditional cross-domain support
 */
function getCookieOptions(customOptions = {}) {
    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        ...customOptions
    };

    if (process.env.NODE_ENV === "production" && process.env.COOKIE_DOMAIN) {
        options.domain = process.env.COOKIE_DOMAIN; // e.g., ".bigso.co"
    }

    return options;
}

/**
 * POST /api/auth/exchange
 * Exchange authorization code for session token from SSO
 */
router.post("/exchange", async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ error: "Authorization code is required" });
        }

        const ssoResponse = await ssoService.exchangeCodeForToken(code, APP_ID);

        if (!ssoResponse.success) {
            return res.status(401).json({ error: "Invalid authorization code" });
        }

        // Set local cookies
        const sessionMaxAge = new Date(ssoResponse.expiresAt).getTime() - Date.now();
        const refreshMaxAge = ssoResponse.refreshExpiresAt 
            ? new Date(ssoResponse.refreshExpiresAt).getTime() - Date.now() 
            : 7 * 24 * 60 * 60 * 1000;

        const sessionCookieOptions = getCookieOptions({
            maxAge: sessionMaxAge > 0 ? sessionMaxAge : 0,
        });
        const refreshCookieOptions = getCookieOptions({
            maxAge: refreshMaxAge > 0 ? refreshMaxAge : 0,
        });

        res.cookie(COOKIE_NAME, ssoResponse.sessionToken, sessionCookieOptions);
        if (ssoResponse.refreshToken) {
            res.cookie(`${COOKIE_NAME}_refresh`, ssoResponse.refreshToken, refreshCookieOptions);
        }

        res.json({
            success: true,
            user: {
                userId: ssoResponse.user.userId,
                email: ssoResponse.user.email,
                firstName: ssoResponse.user.firstName,
                lastName: ssoResponse.user.lastName,
            },
            tenant: {
                tenantId: ssoResponse.tenant.tenantId,
                name: ssoResponse.tenant.name,
                slug: ssoResponse.tenant.slug,
                role: ssoResponse.tenant.role,
                permissions: ssoResponse.tenant.permissions,
            },
            expiresAt: ssoResponse.expiresAt,
        });
    } catch (error) {
        console.error("❌ Error exchanging code:", error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: error.response?.data?.message || "Failed to exchange authorization code",
        });
    }
});

/**
 * GET /api/auth/session
 * Get current session info by validating via SSO (using middleware)
 */
router.get("/session", ssoAuthMiddleware, (req, res) => {
    // Prevent caching
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");

    res.json({
        success: true,
        user: req.user,
        tenant: req.tenant,
        expiresAt: req.ssoSession.expiresAt,
    });
});

/**
 * POST /api/auth/logout
 * Clear local session cookie and revoke SSO session
 */
router.post("/logout", async (req, res) => {
    const sessionToken = req.cookies[COOKIE_NAME];

    if (sessionToken) {
        try {
            await ssoService.revokeSession(sessionToken);
            console.log("✅ Session revoked successfully in SSO Backend.");
        } catch (error) {
            console.error(
                "⚠️ Failed to revoke session in SSO Backend. Clearing local anyway.",
                error.message
            );
        }
    }

    const cookieOptions = getCookieOptions();
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.clearCookie(`${COOKIE_NAME}_refresh`, cookieOptions);

    res.json({ success: true, message: `Logged out from ${APP_ID}` });
});

module.exports = router;
