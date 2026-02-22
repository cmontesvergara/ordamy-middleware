const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * POST /api/payments
 * Register a payment (abono) for an order
 */
router.post("/", rbac("orders", "update"), async (req, res) => {
    try {
        const { orderId, paymentMethodId, amount, paymentDate, notes } = req.body;

        if (!orderId || !paymentMethodId || !amount) {
            return res.status(400).json({
                error: "orderId, paymentMethodId and amount are required",
            });
        }

        const result = await req.prisma.$transaction(async (tx) => {
            // Validate order exists and is active
            const order = await tx.order.findFirst({
                where: { id: orderId, tenantId: req.tenantId },
            });

            if (!order) {
                throw new Error("Order not found");
            }

            if (order.status !== "ACTIVE") {
                throw new Error("Can only add payments to active orders");
            }

            if (parseFloat(amount) > parseFloat(order.balance)) {
                throw new Error("Payment amount exceeds order balance");
            }

            // Create the payment
            const payment = await tx.payment.create({
                data: {
                    tenantId: req.tenantId,
                    orderId,
                    paymentMethodId,
                    amount,
                    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                    registeredBy: req.user.userId,
                    notes,
                },
            });

            // Update order balance
            const newBalance = parseFloat(order.balance) - parseFloat(amount);
            const updateData = { balance: newBalance };

            // If fully paid, mark as COMPLETED
            if (newBalance <= 0) {
                updateData.status = "COMPLETED";

                await tx.orderStatusHistory.create({
                    data: {
                        tenantId: req.tenantId,
                        orderId,
                        fromStatus: "ACTIVE",
                        toStatus: "COMPLETED",
                        reason: "Fully paid",
                        changedBy: req.user.userId,
                    },
                });
            }

            await tx.order.update({
                where: { id: orderId },
                data: updateData,
            });

            // Create transaction record for the account
            const account = await tx.account.findFirst({
                where: { tenantId: req.tenantId, paymentMethodId },
            });

            if (account) {
                await tx.transaction.create({
                    data: {
                        tenantId: req.tenantId,
                        accountId: account.id,
                        type: "CREDIT",
                        amount,
                        description: `Pago orden #${order.number}`,
                        referenceId: payment.id,
                        referenceType: "PAYMENT",
                        registeredBy: req.user.userId,
                    },
                });

                await tx.account.update({
                    where: { id: account.id },
                    data: { balance: { increment: parseFloat(amount) } },
                });
            }

            return payment;
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error creating payment:", error.message);
        res.status(error.message.includes("not found") ? 404 : 500).json({
            error: error.message || "Failed to create payment",
        });
    }
});

/**
 * GET /api/payments
 * List payments with filters
 */
router.get("/", rbac("orders", "read"), async (req, res) => {
    try {
        const { orderId, from, to, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (orderId) where.orderId = orderId;
        if (from || to) {
            where.paymentDate = {};
            if (from) where.paymentDate.gte = new Date(from);
            if (to) where.paymentDate.lte = new Date(to);
        }

        const [payments, total] = await Promise.all([
            req.prisma.payment.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { paymentDate: "desc" },
                include: {
                    order: { select: { id: true, number: true } },
                    paymentMethod: { select: { id: true, name: true } },
                },
            }),
            req.prisma.payment.count({ where }),
        ]);

        res.json({ success: true, data: payments, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing payments:", error.message);
        res.status(500).json({ error: "Failed to list payments" });
    }
});

module.exports = router;
