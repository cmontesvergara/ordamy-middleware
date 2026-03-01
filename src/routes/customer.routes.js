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
 * Get customer by ID with order history and summary stats
 */
router.get("/:id", rbac("customers", "read"), async (req, res) => {
    try {
        const { dateFrom, dateTo, status, operationalStatus, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const customer = await req.prisma.customer.findFirst({
            where: { id: req.params.id },
        });

        if (!customer) {
            return res.status(404).json({ error: "Customer not found" });
        }

        // Build order filter
        const orderWhere = { customerId: req.params.id };
        if (status) orderWhere.status = status;
        if (operationalStatus) orderWhere.operationalStatus = operationalStatus;
        if (dateFrom || dateTo) {
            orderWhere.orderDate = {};
            if (dateFrom) orderWhere.orderDate.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                orderWhere.orderDate.lte = end;
            }
        }

        // Fetch filtered orders + aggregates in parallel
        const [orders, orderCount, totalStats, debtStats] = await Promise.all([
            req.prisma.order.findMany({
                where: orderWhere,
                skip,
                take: parseInt(limit),
                orderBy: { orderDate: "desc" },
                select: {
                    id: true, number: true, orderDate: true, total: true,
                    balance: true, status: true, sellerName: true, operationalStatus: true,
                },
            }),
            req.prisma.order.count({ where: orderWhere }),
            // Lifetime stats (all orders for this customer)
            req.prisma.order.aggregate({
                where: { customerId: req.params.id },
                _sum: { total: true },
                _count: true,
            }),
            // Current debt (active orders with balance > 0)
            req.prisma.order.aggregate({
                where: { customerId: req.params.id, status: "ACTIVE", balance: { gt: 0 } },
                _sum: { balance: true },
                _count: true,
            }),
        ]);

        res.json({
            success: true,
            data: {
                ...customer,
                orders,
                orderTotal: orderCount,
                orderPage: parseInt(page),
                orderLimit: parseInt(limit),
                stats: {
                    totalOrders: totalStats._count,
                    totalSpent: totalStats._sum.total || 0,
                    totalDebt: debtStats._sum.balance || 0,
                    activeDebtOrders: debtStats._count,
                },
            },
        });
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
router.put("/:id", rbac("customers", "edit"), async (req, res) => {
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

/**
 * DELETE /api/customers/:id
 * Delete a customer (only if no orders)
 */
router.delete("/:id", rbac("customers", "delete"), async (req, res) => {
    try {
        const orderCount = await req.prisma.order.count({
            where: { customerId: req.params.id },
        });

        if (orderCount > 0) {
            return res.status(400).json({
                error: `No se puede eliminar: el cliente tiene ${orderCount} orden(es). Primero debe anular o eliminar sus órdenes.`,
            });
        }

        await req.prisma.customer.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true, message: "Customer deleted" });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Customer not found" });
        }
        console.error("❌ Error deleting customer:", error.message);
        res.status(500).json({ error: "Failed to delete customer" });
    }
});

module.exports = router;
