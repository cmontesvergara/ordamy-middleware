const express = require("express");
const ssoSyncGuardMiddleware = require("../middlewares/ssoSyncGuard.middleware");
const { APP_ID } = require("../config/env");

const router = express.Router();

// Ordamy RBAC Resources
const APP_RESOURCES = [
    { resource: "dashboard", action: "read", description: "Ver dashboard financiero" },
    { resource: "orders", action: "create", description: "Crear órdenes" },
    { resource: "orders", action: "read", description: "Ver órdenes" },
    { resource: "orders", action: "update", description: "Operaciones en órdenes (pagos, anulación, estado)" },
    { resource: "orders", action: "edit", description: "Editar datos de una orden (cliente, items, notas)" },
    { resource: "orders", action: "apply_discount", description: "Aplicar descuentos en órdenes" },
    { resource: "payments", action: "edit", description: "Editar pagos registrados" },
    { resource: "payments", action: "delete", description: "Eliminar pagos registrados" },
    { resource: "customers", action: "read", description: "Ver clientes" },
    { resource: "customers", action: "create", description: "Crear clientes" },
    { resource: "customers", action: "edit", description: "Editar datos de clientes" },
    { resource: "customers", action: "delete", description: "Eliminar clientes" },
    { resource: "cashier", action: "read", description: "Ver caja" },
    { resource: "cashier", action: "update", description: "Operar en caja" },
    { resource: "expenses", action: "read", description: "Ver egresos" },
    { resource: "expenses", action: "create", description: "Crear egresos" },
    { resource: "expenses", action: "edit", description: "Editar egresos" },
    { resource: "expenses", action: "delete", description: "Eliminar egresos" },
    { resource: "portfolio", action: "read", description: "Ver cartera" },
    { resource: "reports", action: "read", description: "Generar reportes/cortes" },
    { resource: "reports", action: "print", description: "Imprimir reportes" },
    { resource: "settings", action: "read", description: "Ver configuración" },
    { resource: "settings", action: "update", description: "Crear/editar config (medios pago, categorías, impuestos, proveedores)" },
    { resource: "settings", action: "delete", description: "Eliminar config (medios pago, categorías, impuestos, proveedores)" },
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
