const ssoService = require("../services/sso.service");
const { COOKIE_NAME, APP_ID } = require("../config/env");
const prisma = require("../config/prisma");

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

        let session = await ssoService.validateSessionToken(sessionToken, APP_ID);

        if (!session) {
            // Token is invalid or expired. Try to refresh if we have a refresh token.
            const refreshToken = req.cookies[`${COOKIE_NAME}_refresh`];
            
            if (refreshToken) {
                console.log("🔄 Attempting to refresh app session...");
                const newSessionData = await ssoService.refreshAppSession(refreshToken, APP_ID);
                
                if (newSessionData) {
                    console.log("✅ App session refreshed successfully.");
                    
                    const sessionMaxAge = new Date(newSessionData.expiresAt).getTime() - Date.now();
                    const refreshMaxAge = newSessionData.refreshExpiresAt 
                        ? new Date(newSessionData.refreshExpiresAt).getTime() - Date.now() 
                        : 7 * 24 * 60 * 60 * 1000;

                    // Set new cookies
                    const sessionCookieOptions = {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === "production",
                        sameSite: "lax",
                        path: "/",
                        maxAge: sessionMaxAge > 0 ? sessionMaxAge : 0,
                    };
                    const refreshCookieOptions = {
                        ...sessionCookieOptions,
                        maxAge: refreshMaxAge > 0 ? refreshMaxAge : 0,
                    };

                    if (process.env.NODE_ENV === "production" && process.env.COOKIE_DOMAIN) {
                        sessionCookieOptions.domain = process.env.COOKIE_DOMAIN;
                        refreshCookieOptions.domain = process.env.COOKIE_DOMAIN;
                    }

                    res.cookie(COOKIE_NAME, newSessionData.sessionToken, sessionCookieOptions);
                    res.cookie(`${COOKIE_NAME}_refresh`, newSessionData.refreshToken, refreshCookieOptions);

                    // Re-validate with the new session token to get the full user/tenant payload
                    // (Or we could parse the payload from the refresh response if it was fully populated, 
                    // but /verify-session gives us the exact structure Ordamy expects)
                    session = await ssoService.validateSessionToken(newSessionData.sessionToken, APP_ID);
                }
            }

            if (!session) {
                // Clear invalid cookies
                res.clearCookie(COOKIE_NAME);
                res.clearCookie(`${COOKIE_NAME}_refresh`);
                return res.status(401).json({ error: "Session expired or invalid" });
            }
        }

        // Sync Tenant locally to ensure foreign keys in Ordamy DB don't fail
        const localTenant = await prisma.tenant.upsert({
            where: { ssoId: session.tenant.tenantId },
            update: {
                name: session.tenant.name,
                slug: session.tenant.slug
            },
            create: {
                ssoId: session.tenant.tenantId,
                name: session.tenant.name,
                slug: session.tenant.slug
            }
        });

        // Attach data to request
        req.user = session.user;
        req.tenant = {
            ...session.tenant,
            localId: localTenant.id // Pass the local internal database ID
        };
        req.ssoSession = session;

        next();
    } catch (error) {
        console.error("❌ Authentication Middleware Error:", error.message);
        res.status(500).json({ error: "Internal authentication error" });
    }
}

module.exports = ssoAuthMiddleware;
