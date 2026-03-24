const { ssoAuthMiddleware } = require("@bigso/auth-sdk/express");
const { ssoClient } = require("../config/ssoClient");
const { COOKIE_NAME, NODE_ENV, COOKIE_DOMAIN } = require("../config/env");
const prisma = require("../config/prisma");

// Export an instance of the SDK's middleware with our custom DB sync logic
module.exports = ssoAuthMiddleware({
    ssoClient,
    cookieName: COOKIE_NAME,
    cookieDomain: COOKIE_DOMAIN,
    isProduction: NODE_ENV === "production",
    onSessionValidated: async (session, req) => {
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

        // Modify the session's tenant object to include localId
        // This makes req.tenant accessible in downstream business routes
        session.tenant = {
            ...session.tenant,
            localId: localTenant.id // Pass the local internal database ID
        };
    }
});
