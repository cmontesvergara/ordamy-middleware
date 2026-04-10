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
    // 1. Validar JWT usando el SDK
    sdkAuthMiddleware({ ssoClient }),
    
    // 2. Procesar datos del token y sincronizar
    async (req, res, next) => {
        try {
            // Si el middleware del SDK no seteó tokenPayload, es inválido
            if (!req.tokenPayload) {
                return res.status(401).json({ error: "Invalid or missing authentication token" });
            }

            const payload = req.tokenPayload;
            
            // Verificar que el token tenga tenants
            // Un usuario válido debe pertenecer al menos a un tenant
            const tenants = payload.tenants || [];
            if (tenants.length === 0) {
                console.warn(`[Ordamy] User ${payload.sub} has no tenants assigned`);
                return res.status(403).json({ error: "User has no tenant access" });
            }

            // Tomar el tenant primario (primer elemento del array)
            const primaryTenant = tenants[0];

            // 3. Detectar si el token está por expirar
            // Si expira en menos de REFRESH_THRESHOLD_MS, marcar para refresh
            if (payload.exp) {
                const expirationTime = payload.exp * 1000; // Convertir de segundos a ms
                const currentTime = Date.now();
                const timeUntilExpiration = expirationTime - currentTime;

                if (timeUntilExpiration < REFRESH_THRESHOLD_MS) {
                    console.log(`[Ordamy] Token expires in ${Math.round(timeUntilExpiration / 1000)}s, marking for refresh`);
                    res.locals.refreshRequired = true;
                }
            }

            // 4. Sincronizar tenant con base de datos local
            // Esto asegura que las foreign keys en las tablas de Ordamy funcionen
            let localTenant;
            try {
                localTenant = await prisma.tenant.upsert({
                    where: { ssoId: primaryTenant.id },
                    update: {
                        name: primaryTenant.name || "",
                        slug: primaryTenant.slug || ""
                    },
                    create: {
                        ssoId: primaryTenant.id,
                        name: primaryTenant.name || "",
                        slug: primaryTenant.slug || ""
                    }
                });
            } catch (dbError) {
                console.error("[Ordamy] Database error syncing tenant:", dbError.message);
                return res.status(500).json({ error: "Failed to synchronize tenant data" });
            }

            // 5. Cargar permisos desde SSO (con cache Redis)
            const accessToken = req.headers.authorization?.substring(7) || "";
            let permissions = [];
            
            if (primaryTenant.role && accessToken) {
                try {
                    // Pasar tenantId (primaryTenant.id) para cachear permisos por tenant
                    permissions = await fetchPermissionsFromSSO(accessToken, primaryTenant.role, primaryTenant.id);
                } catch (permError) {
                    console.error("[Ordamy] Failed to fetch permissions from SSO:", permError.message);
                    // Opción A (estricta): Fallar la request
                    return res.status(500).json({ error: "Failed to load user permissions" });
                    // Opción B (permissive): Continuar sin permisos
                    // permissions = [];
                }
            }

            // 6. Enriquecer req con datos estructurados
            // Similar a la estructura del middleware original
            req.user = {
                userId: payload.sub,
                isSuperAdmin: payload.systemRole === "super_admin" || payload.systemRole === "superadmin"
            };

            req.tenant = {
                id: primaryTenant.id,
                localId: localTenant.id,
                name: primaryTenant.name || "",
                slug: primaryTenant.slug || "",
                role: primaryTenant.role || null,
                permissions: permissions
            };

            // Datos de autenticación adicionales (no expuestos al cliente)
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
