const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

// ─── Payment Methods ──────────────────────────────────────

router.get("/payment-methods", rbac("settings", "read"), async (req, res) => {
    try {
        const methods = await req.prisma.paymentMethod.findMany({
            orderBy: { name: "asc" },
        });
        res.json({ success: true, data: methods });
    } catch (error) {
        res.status(500).json({ error: "Failed to list payment methods" });
    }
});

router.post("/payment-methods", rbac("settings", "update"), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "name is required" });

        const method = await req.prisma.paymentMethod.create({ data: { tenantId: req.tenantId, name } });
        res.status(201).json({ success: true, data: method });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Payment method already exists" });
        res.status(500).json({ error: "Failed to create payment method" });
    }
});

router.put("/payment-methods/:id", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, isActive } = req.body;
        const method = await req.prisma.paymentMethod.update({
            where: { id: req.params.id },
            data: { name, isActive },
        });
        res.json({ success: true, data: method });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Payment method not found" });
        res.status(500).json({ error: "Failed to update payment method" });
    }
});

router.delete("/payment-methods/:id", rbac("settings", "delete"), async (req, res) => {
    try {
        await req.prisma.paymentMethod.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: "Payment method deleted" });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Payment method not found" });
        if (error.code === "P2003") return res.status(400).json({ error: "No se puede eliminar: tiene pagos asociados" });
        res.status(500).json({ error: "Failed to delete payment method" });
    }
});

// ─── Categories ───────────────────────────────────────────

router.get("/categories", rbac("settings", "read"), async (req, res) => {
    try {
        const { type } = req.query;
        const where = {};
        if (type) where.type = type;

        const categories = await req.prisma.category.findMany({
            where,
            orderBy: { name: "asc" },
        });
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ error: "Failed to list categories" });
    }
});

router.post("/categories", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, type } = req.body;
        if (!name || !type) return res.status(400).json({ error: "name and type are required" });

        const category = await req.prisma.category.create({ data: { tenantId: req.tenantId, name, type } });
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Category already exists" });
        res.status(500).json({ error: "Failed to create category" });
    }
});

router.put("/categories/:id", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, type, isActive } = req.body;
        const category = await req.prisma.category.update({
            where: { id: req.params.id },
            data: { name, type, isActive },
        });
        res.json({ success: true, data: category });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Category not found" });
        res.status(500).json({ error: "Failed to update category" });
    }
});

router.delete("/categories/:id", rbac("settings", "delete"), async (req, res) => {
    try {
        await req.prisma.category.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: "Category deleted" });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Category not found" });
        if (error.code === "P2003") return res.status(400).json({ error: "No se puede eliminar: tiene registros asociados" });
        res.status(500).json({ error: "Failed to delete category" });
    }
});

// ─── Suppliers ────────────────────────────────────────────

router.get("/suppliers", rbac("settings", "read"), async (req, res) => {
    try {
        const { search } = req.query;
        const where = {};
        if (search) {
            where.name = { contains: search, mode: "insensitive" };
        }

        const suppliers = await req.prisma.supplier.findMany({
            where,
            orderBy: { name: "asc" },
        });
        res.json({ success: true, data: suppliers });
    } catch (error) {
        res.status(500).json({ error: "Failed to list suppliers" });
    }
});

router.post("/suppliers", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, identification, phone, email } = req.body;
        if (!name) return res.status(400).json({ error: "name is required" });

        const supplier = await req.prisma.supplier.create({
            data: { tenantId: req.tenantId, name, identification, phone, email },
        });
        res.status(201).json({ success: true, data: supplier });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Supplier already exists" });
        res.status(500).json({ error: "Failed to create supplier" });
    }
});

router.put("/suppliers/:id", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, identification, phone, email, isActive } = req.body;
        const supplier = await req.prisma.supplier.update({
            where: { id: req.params.id },
            data: { name, identification, phone, email, isActive },
        });
        res.json({ success: true, data: supplier });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Supplier not found" });
        res.status(500).json({ error: "Failed to update supplier" });
    }
});

router.delete("/suppliers/:id", rbac("settings", "delete"), async (req, res) => {
    try {
        await req.prisma.supplier.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: "Supplier deleted" });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Supplier not found" });
        if (error.code === "P2003") return res.status(400).json({ error: "No se puede eliminar: tiene egresos asociados" });
        res.status(500).json({ error: "Failed to delete supplier" });
    }
});

// ─── Tax Config ───────────────────────────────────────────

router.get("/tax-configs", rbac("settings", "read"), async (req, res) => {
    try {
        const configs = await req.prisma.taxConfig.findMany({
            orderBy: { name: "asc" },
        });
        res.json({ success: true, data: configs });
    } catch (error) {
        res.status(500).json({ error: "Failed to list tax configs" });
    }
});

router.post("/tax-configs", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, rate, isDefault } = req.body;
        if (!name || rate === undefined) return res.status(400).json({ error: "name and rate are required" });

        const config = await req.prisma.taxConfig.create({
            data: { tenantId: req.tenantId, name, rate, isDefault: isDefault || false },
        });
        res.status(201).json({ success: true, data: config });
    } catch (error) {
        if (error.code === "P2002") return res.status(409).json({ error: "Tax config already exists" });
        res.status(500).json({ error: "Failed to create tax config" });
    }
});

router.put("/tax-configs/:id", rbac("settings", "update"), async (req, res) => {
    try {
        const { name, rate, isDefault, isActive } = req.body;
        const config = await req.prisma.taxConfig.update({
            where: { id: req.params.id },
            data: { name, rate, isDefault, isActive },
        });
        res.json({ success: true, data: config });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Tax config not found" });
        res.status(500).json({ error: "Failed to update tax config" });
    }
});

router.delete("/tax-configs/:id", rbac("settings", "delete"), async (req, res) => {
    try {
        await req.prisma.taxConfig.delete({ where: { id: req.params.id } });
        res.json({ success: true, message: "Tax config deleted" });
    } catch (error) {
        if (error.code === "P2025") return res.status(404).json({ error: "Tax config not found" });
        res.status(500).json({ error: "Failed to delete tax config" });
    }
});

// ─── Financial Config ─────────────────────────────────────

router.get("/financial", rbac("settings", "read"), async (req, res) => {
    try {
        let config = await req.prisma.financialConfig.findFirst();

        if (!config) {
            // Create default config
            config = await req.prisma.financialConfig.create({
                data: { tenantId: req.tenantId },
            });
        }

        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ error: "Failed to get financial config" });
    }
});

router.put("/financial", rbac("settings", "update"), async (req, res) => {
    try {
        const { graceDays, currency, timezone, dueDate } = req.body;

        const config = await req.prisma.financialConfig.upsert({
            where: { tenantId: req.tenantId },
            update: { graceDays, currency, timezone, dueDate: dueDate ? new Date(dueDate) : null },
            create: {
                tenantId: req.tenantId,
                graceDays: graceDays || 30,
                currency: currency || "COP",
                timezone: timezone || "America/Bogota",
                dueDate: dueDate ? new Date(dueDate) : null,
            },
        });

        res.json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ error: "Failed to update financial config" });
    }
});

module.exports = router;
