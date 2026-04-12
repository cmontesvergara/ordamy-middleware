import { ssoAuthMiddleware as sdkAuthMiddleware } from "@bigso/auth-sdk/express";
import prisma from "../config/prisma.js";
import { ssoClient } from "../config/ssoClient.js";
import { fetchPermissionsFromSSO } from "../services/permissions.service.js";

/**
 * Tiempo antes de expiración para solicitar refresh (5 minutos en ms)
 */
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Middleware de autenticación unificado para Ordamy.
 * 
 * Responsabilidades:
 * 1. Validar JWT usando el SDK de Bigso
 * 2. Verificar que el usuario tenga al menos un tenant
 * 3. Detectar tokens próximos a expirar y marcar para refresh
 * 4. Sincronizar tenant con base de datos local
 * 5. Cargar permisos desde SSO
 * 6. Enriquecer req con datos del usuario y tenant
 * 
 * Basado en la implementación original que manejaba sesiones con cookies,
 * adaptado al nuevo paradigma de JWT con Bearer tokens.
 * 
 * @returns {Array} Array de middlewares de Express
 */
export const authMiddleware = [
    sdkAuthMiddleware({ ssoClient }),
    async (req, res, next) => {
        try {
            if (!req.tokenPayload) {
                return res.status(401).json({ error: "Invalid or missing authentication token" });
            }

            const payload = req.tokenPayload;
            
            const tenants = payload.tenants || [];
            if (tenants.length === 0) {
                console.warn(`[Ordamy] User ${payload.sub} has no tenants assigned`);
                return res.status(403).json({ error: "User has no tenant access" });
            }


            if (payload.exp) {
                const expirationTime = payload.exp * 1000; // Convertir de segundos a ms
                const currentTime = Date.now();
                const timeUntilExpiration = expirationTime - currentTime;

                if (timeUntilExpiration < REFRESH_THRESHOLD_MS) {
                    console.log(`[Ordamy] Token expires in ${Math.round(timeUntilExpiration / 1000)}s, marking for refresh`);
                    res.locals.refreshRequired = true;
                }
            }
            let localTenant;
            try {
                localTenant = await prisma.tenant.upsert({
                    where: { ssoId: req.tenant.id },
                    update: {
                        name: req.tenant.name,
                        slug: req.tenant.slug 
                    },
                    create: {
                        ssoId: req.tenant.id,
                        name: req.tenant.name,
                        slug: req.tenant.slug
                    }
                });
            } catch (dbError) {
                console.error("[Ordamy] Database error syncing tenant:", dbError.message);
                return res.status(500).json({ error: "Failed to synchronize tenant data" });
            }

            const accessToken = req.headers.authorization?.substring(7) || "";
            let permissions = [];
            
            if (req.tenant.role && accessToken) {
                try {
                    
                    permissions = await fetchPermissionsFromSSO(accessToken, req.tenant.role, localTenant.id);
                } catch (permError) {
                    console.error("[Ordamy] Failed to fetch permissions from SSO:", permError.message);
                    return res.status(500).json({ error: "Failed to load user permissions" });
                }
            }
            req.user = {
                ...req.user,
                isSuperAdmin: payload.systemRole === "super_admin" || payload.systemRole === "superadmin"
            };

            req.tenant = {
                ...req.tenant,
                localId: localTenant.id,
                permissions: permissions
            };

            req.auth = {
                accessToken: accessToken,
                expiresAt: payload.exp ? new Date(payload.exp * 1000) : null
            };

            next();
        } catch (error) {
            console.error("[Ordamy] Authentication middleware error:", error.message);
            res.status(500).json({ error: "Internal authentication error" });
        }
    }
];

export default authMiddleware;
