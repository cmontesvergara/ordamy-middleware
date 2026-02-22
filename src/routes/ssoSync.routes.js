const express = require("express");
const ssoSyncGuardMiddleware = require("../middlewares/ssoSyncGuard.middleware");
const { APP_ID } = require("../config/env");

const router = express.Router();

// Ordamy RBAC Resources
const APP_RESOURCES = [
    { resource: "dashboard", action: "read", description: "Ver dashboard financiero" },
    { resource: "orders", action: "create", description: "Crear órdenes" },
    { resource: "orders", action: "read", description: "Ver órdenes" },
    { resource: "orders", action: "update", description: "Editar órdenes (pagos, anulación)" },
    { resource: "customers", action: "read", description: "Ver clientes" },
    { resource: "customers", action: "create", description: "Crear clientes" },
    { resource: "cashier", action: "read", description: "Ver caja" },
    { resource: "cashier", action: "update", description: "Operar en caja" },
    { resource: "expenses", action: "read", description: "Ver egresos" },
    { resource: "expenses", action: "create", description: "Crear egresos" },
    { resource: "expenses", action: "delete", description: "Eliminar egresos" },
    { resource: "portfolio", action: "read", description: "Ver cartera" },
    { resource: "reports", action: "read", description: "Generar reportes/cortes" },
    { resource: "reports", action: "print", description: "Imprimir reportes" },
    { resource: "settings", action: "read", description: "Ver configuración" },
    { resource: "settings", action: "update", description: "Editar config (medios pago, categorías)" },
];

/**
 * GET /api/sso/resources
 * Expose resources for SSO synchronization (Pull Model)
 */
router.get("/resources", ssoSyncGuardMiddleware, async (req, res) => {
    try {
        res.json({
            success: true,
            resources: APP_RESOURCES,
            meta: {
                appId: APP_ID,
                count: APP_RESOURCES.length,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error("❌ Error in sync endpoint:", error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
