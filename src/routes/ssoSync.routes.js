import { createSsoSyncRouter  } from "@bigso/auth-sdk/express";
import { APP_ID, NODE_ENV, SSO_BACKEND_URL  } from "../config/env.js";

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
    { resource: "products", action: "read", description: "Ver catálogo de productos" },
    { resource: "products", action: "create", description: "Crear nuevos productos" },
    { resource: "products", action: "update", description: "Editar productos" },
    { resource: "materials", action: "read", description: "Ver catálogo de materiales" },
    { resource: "materials", action: "create", description: "Crear nuevos materiales" },
    { resource: "materials", action: "update", description: "Editar materiales" },
    { resource: "materials", action: "delete", description: "Eliminar materiales" },
    { resource: "settings", action: "read", description: "Ver configuración" },
    { resource: "settings", action: "update", description: "Crear/editar config (medios pago, categorías, impuestos, proveedores)" },
    { resource: "settings", action: "delete", description: "Eliminar config (medios pago, categorías, impuestos, proveedores)" },
];

export default createSsoSyncRouter({
    resources: APP_RESOURCES,
    appId: APP_ID,
    ssoBackendUrl: SSO_BACKEND_URL,
    isProduction: NODE_ENV === "production"
});

