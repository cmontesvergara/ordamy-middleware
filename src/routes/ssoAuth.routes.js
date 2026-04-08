import { Router } from "express";
import { ssoAuthMiddleware } from "@bigso/auth-sdk/express";
import { ssoClient } from "../config/ssoClient.js";
import { FRONTEND_URL, SSO_BACKEND_URL, APP_ID } from "../config/env.js";
import prisma from "../config/prisma.js";

const authMiddleware = ssoAuthMiddleware({ ssoClient });

async function fetchPermissionsFromSSO(accessToken, roleName) {
    try {
        const url = `${SSO_BACKEND_URL}/api/v2/role/${encodeURIComponent(roleName)}/permission?appId=${APP_ID}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return [];
        const data = await response.json();
        const allPerms = data.permissions || [];
        return allPerms.filter(p => p.appId === APP_ID);
    } catch (error) {
        console.error("[Ordamy] Failed to fetch permissions from SSO Core:", error.message);
        return [];
    }
}

const router = Router();

router.post("/exchange", async (req, res) => {
    try {
        const { code, codeVerifier } = req.body;
        if (!code || !codeVerifier) {
            return res.status(400).json({ error: 'code and codeVerifier are required' });
        }

        const ssoResponse = await ssoClient.exchangeCode(code, codeVerifier);

        console.log(`✅ [Ordamy] User ${ssoResponse.user.email} logged in via code exchange.`);

        res.json({
            success: true,
            tokens: ssoResponse.tokens,
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
        const { payload } = req.body;
        if (!payload) {
            return res.status(400).json({ error: 'Signed payload is required' });
        }

        const verified = await ssoClient.verifySignedPayload(payload, FRONTEND_URL);
        if (!verified.code) {
            return res.status(400).json({ error: 'No authorization code found in payload' });
        }

        const codeVerifier = verified.code_verifier;
        if (!codeVerifier) {
            return res.status(400).json({ error: 'code_verifier is required for PKCE exchange' });
        }

        const ssoResponse = await ssoClient.exchangeCode(verified.code, codeVerifier);

        console.log(`✅ [Ordamy] User ${ssoResponse.user.email} logged in via SSO.`);

        res.json({
            success: true,
            tokens: ssoResponse.tokens,
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
        const ssoResponse = await ssoClient.refreshTokens();
        res.json({
            success: true,
            tokens: ssoResponse.tokens,
        });
    } catch (error) {
        console.error('[Ordamy] Error refreshing tokens:', error.message);
        res.status(401).json({ error: error.message || 'Failed to refresh tokens' });
    }
});

router.post("/logout", authMiddleware, async (req, res) => {
    try {
        const accessToken = req.headers.authorization?.substring(7) || '';
        const { revokeAll = false } = req.body || {};

        await ssoClient.logout(accessToken, revokeAll);

        console.log(`👋 [Ordamy] User logged out.`);
        res.json({ success: true, message: 'Logged out' });
    } catch (error) {
        console.warn('[Ordamy] Failed to logout in SSO Backend.', error.message);
        res.json({ success: true, message: 'Logged out (backend revocation failed)' });
    }
});

export default router;