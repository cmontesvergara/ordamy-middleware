import { Router } from "express";
import { ssoAuthMiddleware } from "@bigso/auth-sdk/express";
import { ssoClient } from "../config/ssoClient.js";
import { FRONTEND_URL, COOKIE_DOMAIN, COOKIE_SAMESITE } from "../config/env.js";
import prisma from "../config/prisma.js";
import { fetchPermissionsFromSSO } from "../services/permissions.service.js";

const authMiddleware = ssoAuthMiddleware({ ssoClient });

const router = Router();

router.post("/exchange", async (req, res) => {
    try {
        const { code, codeVerifier } = req.body;
        if (!code || !codeVerifier) {
            return res.status(400).json({ error: 'code and codeVerifier are required' });
        }

        const ssoResponse = await ssoClient.exchangeCode(code, codeVerifier);
        
        console.log(`✅ [Ordamy] User ${ssoResponse.user.email} logged in via code exchange.`);

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
        console.error('[Ordamy] Error exchanging code:', error.message);
        res.status(401).json({ error: error.message || 'Failed to exchange authorization code' });
    }
});

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

router.get("/session", authMiddleware, async (req, res) => {
    try {
        const accessToken = req.headers.authorization?.substring(7) || '';
        const primaryTenant = req.tokenPayload?.tenants?.[0];

        let permissions = [];
        if (primaryTenant) {
            permissions = await fetchPermissionsFromSSO(accessToken, primaryTenant.role);
        }

        if (primaryTenant) {
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
        }

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json({
            success: true,
            user: {
                userId: req.tokenPayload.sub,
                email: '',
                firstName: '',
                lastName: '',
                isSuperAdmin: req.tokenPayload.systemRole === 'super_admin' || req.tokenPayload.systemRole === 'superadmin',
            },
            tenant: req.tenant ? {
                tenantId: req.tenant.id,
                name: req.tenant.name || '',
                slug: req.tenant.slug || '',
                role: req.tenant.role,
                permissions,
            } : undefined,
            tokenPayload: req.tokenPayload,
        });
    } catch (error) {
        console.error('[Ordamy] Session error:', error.message);
        res.status(500).json({ error: 'Session resolution failed' });
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