import { Router } from "express";
import { COOKIE_DOMAIN, COOKIE_SAMESITE, FRONTEND_URL } from "../config/env.js";
import { ssoClient } from "../config/ssoClient.js";
import { authMiddleware } from "../middlewares/ssoAuth.middleware.js";

const router = Router();


router.post("/exchange-v2", async (req, res) => {
    try {
        const { payload, codeVerifier: codeVerifierFromBody } = req.body;
        if (!payload) {
            return res.status(400).json({ error: 'Signed payload is required' });
        }

        const verified = await ssoClient.verifySignedPayload(payload, FRONTEND_URL);
        if (!verified.code) {
            return res.status(400).json({ error: 'No authorization code found in payload' });
        }

        const verifier = codeVerifierFromBody || verified.code_verifier;
        if (!verifier) {
            return res.status(400).json({ error: 'codeVerifier is required for PKCE exchange' });
        }

        const ssoResponse = await ssoClient.exchangeCode(verified.code, verifier);

        console.log(`✅ [Ordamy] User ${ssoResponse.user.email} logged in via SSO.`);
        
        // Extraer refreshToken de la respuesta del SSO
        const { accessToken, refreshToken, expiresIn } = ssoResponse.tokens;
        
        if (!refreshToken) {
            console.error('[Ordamy] No refresh token received from SSO');
            return res.status(500).json({ error: 'Authentication error: no refresh token' });
        }
        
        // Crear cookie PROPIA del middleware (httpOnly, secure)
        res.cookie('ordamy_refresh_token', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: COOKIE_SAMESITE,
            path: '/api/auth/refresh',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
            domain: COOKIE_DOMAIN
        });
        
        console.log(`[Ordamy] Cookie set: domain=${COOKIE_DOMAIN}, path=/api/auth/refresh, sameSite=${COOKIE_SAMESITE}`);

        // Devolver al frontend SIN el refreshToken (queda en cookie httpOnly)
        res.json({
            success: true,
            tokens: {
                accessToken,
                expiresIn
            },
            user: ssoResponse.user,
            tenant: ssoResponse.tenant,
        });
    } catch (error) {
        console.error('[Ordamy] Error exchanging v2 payload:', error.message);
        res.status(401).json({ error: error.message || 'Failed to verify signed payload' });
    }
});

/**
 * GET /api/auth/session
 * 
 * Devuelve la información de la sesión del usuario autenticado.
 * 
 * El middleware authMiddleware ya ha:
 * - Validado el JWT
 * - Sincronizado el tenant con la base de datos local
 * - Cargado los permisos desde el SSO
 * - Enriquecido req.user y req.tenant
 * 
 * Esta ruta solo construye la respuesta JSON.
 * 
 * Si el token está próximo a expirar, se incluye la flag `refreshRequired: true`
 * para que el frontend llame a POST /api/auth/refresh explícitamente.
 */
router.get("/session", authMiddleware, async (req, res) => {
    try {
        // Verificar que el middleware haya establecido el usuario
        // Si no está presente, el middleware ya devolvió 401/403
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Headers anti-caché (seguridad)
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        // Construir respuesta desde datos del middleware
        const response = {
            success: true,
            user: req.user,
        };
        // Incluir tenant solo si existe
        if (req.tenant) {
            response.tenant = {
                tenantId: req.tenant.id,
                localId: req.tenant.localId,
                name: req.tenant.name,
                slug: req.tenant.slug,
                role: req.tenant.role,
                permissions: req.tenant.permissions,
            };
        }

        // Si el middleware marcó que se requiere refresh, informar al frontend
        if (res.locals.refreshRequired) {
            response.refreshRequired = true;
            console.log('[Ordamy] Session response includes refreshRequired flag');
        }

        res.json(response);
    } catch (error) {
        console.error('[Ordamy] Session route error:', error.message);
        res.status(500).json({ error: 'Failed to retrieve session' });
    }
});

router.post("/refresh", async (req, res) => {
    try {
        console.log('[Ordamy] Refresh request received');
        console.log('[Ordamy] Cookies present:', Object.keys(req.cookies || {}));
        
        // Leer refresh token de la cookie PROPIA del middleware
        const refreshToken = req.cookies?.['ordamy_refresh_token'];
        
        if (!refreshToken) {
            console.error('[Ordamy] No refresh token found in cookie ordamy_refresh_token');
            console.error('[Ordamy] Available cookies:', Object.keys(req.cookies || {}).join(', ') || 'none');
            return res.status(401).json({ error: 'No refresh token available' });
        }
        
        console.log('[Ordamy] Refresh token found in cookie, calling SSO...');
        
        // Llamar al SSO Core con el refresh token
        const ssoResponse = await ssoClient.refreshTokens(refreshToken);
        
        console.log('[Ordamy] SSO responded successfully');
        
        // Si el SSO devuelve nuevo refresh token, actualizar nuestra cookie
        if (ssoResponse.tokens?.refreshToken) {
            console.log('[Ordamy] Rotating refresh token');
            res.cookie('ordamy_refresh_token', ssoResponse.tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: COOKIE_SAMESITE,
                path: '/api/auth/refresh',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                domain: COOKIE_DOMAIN
            });
            console.log('[Ordamy] New refresh token cookie set');
        }
        
        // Devolver nuevo access token al frontend
        res.json({
            success: true,
            tokens: {
                accessToken: ssoResponse.tokens.accessToken,
                expiresIn: ssoResponse.tokens.expiresIn
            }
        });
    } catch (error) {
        console.error('[Ordamy] Error refreshing tokens:', error.message);
        
        // Si el error es por token revocado/expirado, limpiar cookie
        if (error.message?.includes('revoked') || error.message?.includes('expired') || error.message?.includes('Invalid')) {
            console.log('[Ordamy] Clearing invalid refresh token cookie');
            res.clearCookie('ordamy_refresh_token', {
                path: '/api/auth/refresh',
                domain: COOKIE_DOMAIN
            });
        }
        
        res.status(401).json({ error: error.message || 'Failed to refresh tokens' });
    }
});

router.post("/logout", authMiddleware, async (req, res) => {
    try {
        const accessToken = req.headers.authorization?.substring(7) || '';
        const { revokeAll = false } = req.body || {};

        await ssoClient.logout(accessToken, revokeAll);

        console.log(`👋 [Ordamy] User logged out.`);
        
        // Limpiar nuestra cookie propia
        res.clearCookie('ordamy_refresh_token', {
            path: '/api/auth/refresh',
            domain: COOKIE_DOMAIN
        });
        
        console.log('[Ordamy] Refresh token cookie cleared');
        res.json({ success: true, message: 'Logged out' });
    } catch (error) {
        console.warn('[Ordamy] Failed to logout in SSO Backend.', error.message);
        
        // Aún así limpiar la cookie local
        res.clearCookie('ordamy_refresh_token', {
            path: '/api/auth/refresh',
            domain: COOKIE_DOMAIN
        });
        
        res.json({ success: true, message: 'Logged out (backend revocation failed)' });
    }
});

export default router;