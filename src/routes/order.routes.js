const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/orders
 * List orders with filters
 */
router.get("/", rbac("orders", "read"), async (req, res) => {
    try {
        const { status, customerId, search, dateFrom, dateTo, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (status) where.status = status;
        if (customerId) where.customerId = customerId;
        if (dateFrom || dateTo) {
            where.orderDate = {};
            if (dateFrom) where.orderDate.gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                where.orderDate.lte = end;
            }
        }
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
 * PUT /api/orders/:id
 * Edit order details (notes, dueDate, items)
 */
router.put("/:id", rbac("orders", "edit"), async (req, res) => {
    try {
        const { notes, dueDate, items } = req.body;

        const order = await req.prisma.order.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
            include: { items: true },
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (order.status === "CANCELLED") {
            return res.status(400).json({ error: "Cannot edit cancelled orders" });
        }

        const result = await req.prisma.$transaction(async (tx) => {
            const updateData = {};
            if (notes !== undefined) updateData.notes = notes;
            if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

            // If items provided, replace them and recalculate totals
            if (items && Array.isArray(items)) {
                await tx.orderItem.deleteMany({ where: { orderId: req.params.id } });

                let subtotal = 0;
                for (const item of items) {
                    const lineTotal = parseFloat(item.quantity) * parseFloat(item.unitPrice);
                    subtotal += lineTotal;
                    await tx.orderItem.create({
                        data: {
                            tenantId: req.tenantId,
                            orderId: req.params.id,
                            productId: item.productId || null,
                            description: item.description,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            lineTotal,
                        },
                    });
                }

                const taxAmount = subtotal * parseFloat(order.taxRate);
                const discount = parseFloat(order.discount);
                const total = subtotal + taxAmount - discount;
                const paidSoFar = parseFloat(order.total) - parseFloat(order.balance);
                const newBalance = Math.max(0, total - paidSoFar);

                updateData.subtotal = subtotal;
                updateData.taxAmount = taxAmount;
                updateData.total = total;
                updateData.balance = newBalance;
            }

            return await tx.order.update({
                where: { id: req.params.id },
                data: updateData,
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
                },
            });
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error editing order:", error.message);
        res.status(500).json({ error: "Failed to edit order" });
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

        // O2: Validate discount permission
        if (discount > 0) {
            const permissions = req.ssoSession?.tenant?.permissions || [];
            const canDiscount = req.user?.isSuperAdmin || permissions.some(
                (p) => p.resource === "orders" && p.action === "apply_discount"
            );
            if (!canDiscount) {
                return res.status(403).json({ error: "You don't have permission to apply discounts" });
            }
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

        // Check if order has payments — can't cancel with payments
        const paymentCount = await req.prisma.payment.count({
            where: { orderId: req.params.id },
        });

        if (paymentCount > 0) {
            return res.status(400).json({
                error: `No se puede cancelar: la orden tiene ${paymentCount} pago(s) registrado(s). Elimine los pagos primero.`,
            });
        }

        const updated = await req.prisma.$transaction(async (tx) => {
            const result = await tx.order.update({
                where: { id: req.params.id },
                data: {
                    status: "CANCELLED",
                    balance: 0,
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
/**
 * PUT /api/orders/:id/operational-status
 * Update operational status (production tracking)
 */
const OPERATIONAL_FLOW = ["PENDING", "APPROVED", "IN_PRODUCTION", "PRODUCED", "DELIVERED"];

router.put("/:id/operational-status", rbac("orders", "update"), async (req, res) => {
    try {
        const { operationalStatus } = req.body;

        if (!operationalStatus || !OPERATIONAL_FLOW.includes(operationalStatus)) {
            return res.status(400).json({ error: `Invalid status. Valid: ${OPERATIONAL_FLOW.join(", ")}` });
        }

        const order = await req.prisma.order.findFirst({
            where: { id: req.params.id },
        });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (order.status !== "ACTIVE") {
            return res.status(400).json({ error: "Cannot change operational status of non-active orders" });
        }

        // Validate transition (only allow forward or backward by 1 step)
        const currentIdx = OPERATIONAL_FLOW.indexOf(order.operationalStatus);
        const nextIdx = OPERATIONAL_FLOW.indexOf(operationalStatus);

        if (Math.abs(nextIdx - currentIdx) !== 1) {
            return res.status(400).json({
                error: `Cannot transition from ${order.operationalStatus} to ${operationalStatus}. Only adjacent transitions allowed.`,
            });
        }

        const updated = await req.prisma.$transaction(async (tx) => {
            const updateData = { operationalStatus };

            // If delivered and fully paid, auto-complete
            if (operationalStatus === "DELIVERED" && parseFloat(order.balance) <= 0) {
                updateData.status = "COMPLETED";
            }

            const result = await tx.order.update({
                where: { id: req.params.id },
                data: updateData,
            });

            await tx.orderStatusHistory.create({
                data: {
                    tenantId: req.tenantId,
                    orderId: req.params.id,
                    fromStatus: order.status,
                    toStatus: updateData.status || order.status,
                    reason: `Operational: ${order.operationalStatus} → ${operationalStatus}`,
                    changedBy: req.user.userId,
                },
            });

            return result;
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error("❌ Error updating operational status:", error.message);
        res.status(500).json({ error: "Failed to update operational status" });
    }
});

module.exports = router;
