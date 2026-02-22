const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/customers
 * List customers for the current tenant
 */
router.get("/", rbac("customers", "read"), async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (search) {
            where.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { identification: { contains: search, mode: "insensitive" } },
            ];
        }

        const [customers, total] = await Promise.all([
            req.prisma.customer.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { name: "asc" },
            }),
            req.prisma.customer.count({ where }),
        ]);

        res.json({ success: true, data: customers, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing customers:", error.message);
        res.status(500).json({ error: "Failed to list customers" });
    }
});

/**
 * GET /api/customers/:id
 * Get customer by ID
 */
router.get("/:id", rbac("customers", "read"), async (req, res) => {
    try {
        const customer = await req.prisma.customer.findFirst({
            where: { id: req.params.id },
            include: { orders: { orderBy: { orderDate: "desc" }, take: 10 } },
        });

        if (!customer) {
            return res.status(404).json({ error: "Customer not found" });
        }

        res.json({ success: true, data: customer });
    } catch (error) {
        console.error("❌ Error getting customer:", error.message);
        res.status(500).json({ error: "Failed to get customer" });
    }
});

/**
 * POST /api/customers
 * Create a new customer
 */
router.post("/", rbac("customers", "create"), async (req, res) => {
    try {
        const { identification, name, phone, email, address, notes } = req.body;

        if (!identification || !name) {
            return res.status(400).json({ error: "identification and name are required" });
        }

        const customer = await req.prisma.customer.create({
            data: { identification, name, phone, email, address, notes },
        });

        res.status(201).json({ success: true, data: customer });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Customer with this identification already exists" });
        }
        console.error("❌ Error creating customer:", error.message);
        res.status(500).json({ error: "Failed to create customer" });
    }
});

/**
 * PUT /api/customers/:id
 * Update a customer
 */
router.put("/:id", rbac("customers", "create"), async (req, res) => {
    try {
        const { name, phone, email, address, notes, isActive } = req.body;

        const customer = await req.prisma.customer.update({
            where: { id: req.params.id },
            data: { name, phone, email, address, notes, isActive },
        });

        res.json({ success: true, data: customer });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Customer not found" });
        }
        console.error("❌ Error updating customer:", error.message);
        res.status(500).json({ error: "Failed to update customer" });
    }
});

module.exports = router;
