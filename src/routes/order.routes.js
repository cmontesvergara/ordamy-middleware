const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/orders
 * List orders with filters
 */
router.get("/", rbac("orders", "read"), async (req, res) => {
    try {
        const { status, customerId, search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (status) where.status = status;
        if (customerId) where.customerId = customerId;
        if (search) {
            where.OR = [
                { number: isNaN(search) ? undefined : parseInt(search) },
                { customer: { name: { contains: search, mode: "insensitive" } } },
            ].filter(Boolean);
        }

        const [orders, total] = await Promise.all([
            req.prisma.order.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { orderDate: "desc" },
                include: {
                    customer: { select: { id: true, name: true, identification: true } },
                    _count: { select: { items: true, payments: true } },
                },
            }),
            req.prisma.order.count({ where }),
        ]);

        res.json({ success: true, data: orders, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing orders:", error.message);
        res.status(500).json({ error: "Failed to list orders" });
    }
});

/**
 * GET /api/orders/:id
 * Get order detail with items, payments, attachments, and status history
 */
router.get("/:id", rbac("orders", "read"), async (req, res) => {
    try {
        const order = await req.prisma.order.findFirst({
            where: { id: req.params.id },
            include: {
                customer: true,
                items: {
                    include: { product: { select: { id: true, name: true } } },
                    orderBy: { createdAt: "asc" },
                },
                payments: {
                    include: { paymentMethod: { select: { id: true, name: true } } },
                    orderBy: { paymentDate: "desc" },
                },
                attachments: { orderBy: { createdAt: "desc" } },
                statusHistory: { orderBy: { createdAt: "desc" } },
            },
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        res.json({ success: true, data: order });
    } catch (error) {
        console.error("❌ Error getting order:", error.message);
        res.status(500).json({ error: "Failed to get order" });
    }
});

/**
 * POST /api/orders
 * Create a new order with items
 */
router.post("/", rbac("orders", "create"), async (req, res) => {
    try {
        const {
            customerId,
            orderDate,
            dueDate,
            taxRate = 0,
            discount = 0,
            notes,
            items = [],
        } = req.body;

        if (!customerId || items.length === 0) {
            return res.status(400).json({ error: "customerId and at least one item are required" });
        }

        // Calculate totals
        const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
        const taxAmount = subtotal * taxRate;
        const total = subtotal + taxAmount - discount;

        // Get next order number (transactional)
        const result = await req.prisma.$transaction(async (tx) => {
            const maxOrder = await tx.order.findFirst({
                where: { tenantId: req.tenantId },
                orderBy: { number: "desc" },
                select: { number: true },
            });

            const nextNumber = (maxOrder?.number || 0) + 1;

            const order = await tx.order.create({
                data: {
                    tenantId: req.tenantId,
                    number: nextNumber,
                    customerId,
                    orderDate: orderDate ? new Date(orderDate) : new Date(),
                    dueDate: dueDate ? new Date(dueDate) : null,
                    subtotal,
                    taxRate,
                    taxAmount,
                    discount,
                    total,
                    balance: total,
                    sellerId: req.user.userId,
                    sellerName: `${req.user.firstName} ${req.user.lastName}`,
                    notes,
                    items: {
                        create: items.map((item) => ({
                            tenantId: req.tenantId,
                            productId: item.productId || null,
                            description: item.description,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            lineTotal: item.quantity * item.unitPrice,
                        })),
                    },
                    statusHistory: {
                        create: {
                            tenantId: req.tenantId,
                            toStatus: "ACTIVE",
                            changedBy: req.user.userId,
                        },
                    },
                },
                include: {
                    customer: { select: { id: true, name: true } },
                    items: true,
                },
            });

            return order;
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error creating order:", error.message);
        res.status(500).json({ error: "Failed to create order" });
    }
});

/**
 * PUT /api/orders/:id/cancel
 * Cancel an order
 */
router.put("/:id/cancel", rbac("orders", "update"), async (req, res) => {
    try {
        const { reason } = req.body;

        const order = await req.prisma.order.findFirst({
            where: { id: req.params.id },
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (order.status !== "ACTIVE") {
            return res.status(400).json({ error: "Only active orders can be cancelled" });
        }

        const updated = await req.prisma.$transaction(async (tx) => {
            const result = await tx.order.update({
                where: { id: req.params.id },
                data: {
                    status: "CANCELLED",
                    cancellationReason: reason,
                },
            });

            await tx.orderStatusHistory.create({
                data: {
                    tenantId: req.tenantId,
                    orderId: req.params.id,
                    fromStatus: "ACTIVE",
                    toStatus: "CANCELLED",
                    reason,
                    changedBy: req.user.userId,
                },
            });

            return result;
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("❌ Error cancelling order:", error.message);
        res.status(500).json({ error: "Failed to cancel order" });
    }
});

module.exports = router;
