import { ssoAuthMiddleware } from "@bigso/auth-sdk/express";
import { ssoClient } from "../config/ssoClient.js";
import prisma from "../config/prisma.js";

export default [
    ssoAuthMiddleware({ ssoClient }),
    async (req, res, next) => {
        try {
            if (!req.tokenPayload) {
                return next();
            }

            const primaryTenant = req.tokenPayload.tenants?.[0];
            if (!primaryTenant) {
                return next();
            }

            const ssoId = primaryTenant.id;
            const localTenant = await prisma.tenant.upsert({
                where: { ssoId },
                update: { name: primaryTenant.name || '', slug: primaryTenant.slug || '' },
                create: { ssoId, name: primaryTenant.name || '', slug: primaryTenant.slug || '' }
            });

            req.tenant = {
                ...primaryTenant,
                localId: localTenant.id
            };

            next();
        } catch (error) {
            console.error("[Ordamy] Tenant upsert error:", error.message);
            res.status(500).json({ error: "Tenant resolution failed" });
        }
    }
];
