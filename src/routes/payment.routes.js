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

            // If fully paid AND delivered, mark as COMPLETED
            if (newBalance <= 0 && order.operationalStatus === "DELIVERED") {
                updateData.status = "COMPLETED";

                await tx.orderStatusHistory.create({
                    data: {
                        tenantId: req.tenantId,
                        orderId,
                        fromStatus: "ACTIVE",
                        toStatus: "COMPLETED",
                        reason: "Fully paid and delivered",
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

/**
 * PUT /api/payments/:id
 * Edit a payment (amount, method, notes)
 */
router.put("/:id", rbac("payments", "edit"), async (req, res) => {
    try {
        const { paymentMethodId, amount, notes } = req.body;

        const payment = await req.prisma.payment.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
            include: { order: true },
        });

        if (!payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        if (payment.order.status === "CANCELLED") {
            return res.status(400).json({ error: "Cannot edit payment on cancelled order" });
        }

        const oldAmount = parseFloat(payment.amount);
        const newAmount = parseFloat(amount || oldAmount);
        const diff = newAmount - oldAmount;

        // Check new amount doesn't exceed available balance
        const availableBalance = parseFloat(payment.order.balance) + oldAmount;
        if (newAmount > availableBalance) {
            return res.status(400).json({ error: "Amount exceeds available order balance" });
        }

        const result = await req.prisma.$transaction(async (tx) => {
            const updated = await tx.payment.update({
                where: { id: req.params.id },
                data: {
                    ...(paymentMethodId && { paymentMethodId }),
                    ...(amount && { amount: newAmount }),
                    ...(notes !== undefined && { notes }),
                },
                include: { paymentMethod: { select: { id: true, name: true } } },
            });

            // Recalculate order balance
            if (diff !== 0) {
                const newBalance = parseFloat(payment.order.balance) - diff;
                const updateData = { balance: newBalance };

                if (newBalance <= 0 && payment.order.status === "ACTIVE" && payment.order.operationalStatus === "DELIVERED") {
                    updateData.status = "COMPLETED";
                } else if (newBalance > 0 && payment.order.status === "COMPLETED") {
                    updateData.status = "ACTIVE";
                }

                await tx.order.update({
                    where: { id: payment.orderId },
                    data: updateData,
                });

                // Update account transaction
                const account = await tx.account.findFirst({
                    where: { tenantId: req.tenantId, paymentMethodId: payment.paymentMethodId },
                });
                if (account) {
                    await tx.account.update({
                        where: { id: account.id },
                        data: { balance: { increment: diff } },
                    });
                }
            }

            return updated;
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error editing payment:", error.message);
        res.status(500).json({ error: "Failed to edit payment" });
    }
});

/**
 * DELETE /api/payments/:id
 * Delete a payment and reverse its effects on order balance and account
 */
router.delete("/:id", rbac("payments", "delete"), async (req, res) => {
    try {
        const payment = await req.prisma.payment.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
            include: { order: true },
        });

        if (!payment) {
            return res.status(404).json({ error: "Payment not found" });
        }

        if (payment.order.status === "CANCELLED") {
            return res.status(400).json({ error: "Cannot delete payment on cancelled order" });
        }

        await req.prisma.$transaction(async (tx) => {
            await tx.payment.delete({ where: { id: req.params.id } });

            // Reverse order balance
            const amt = parseFloat(payment.amount);
            const newBalance = parseFloat(payment.order.balance) + amt;
            const updateData = { balance: newBalance };

            // If order was COMPLETED, revert to ACTIVE
            if (payment.order.status === "COMPLETED") {
                updateData.status = "ACTIVE";
                await tx.orderStatusHistory.create({
                    data: {
                        tenantId: req.tenantId,
                        orderId: payment.orderId,
                        fromStatus: "COMPLETED",
                        toStatus: "ACTIVE",
                        reason: `Payment deleted (${amt})`,
                        changedBy: req.user.userId,
                    },
                });
            }

            await tx.order.update({
                where: { id: payment.orderId },
                data: updateData,
            });

            // Reverse account transaction
            const account = await tx.account.findFirst({
                where: { tenantId: req.tenantId, paymentMethodId: payment.paymentMethodId },
            });
            if (account) {
                await tx.account.update({
                    where: { id: account.id },
                    data: { balance: { decrement: amt } },
                });
            }

            // Delete related transaction record
            await tx.transaction.deleteMany({
                where: { referenceId: req.params.id, referenceType: "PAYMENT" },
            });
        });

        res.json({ success: true, message: "Payment deleted" });
    } catch (error) {
        console.error("❌ Error deleting payment:", error.message);
        res.status(500).json({ error: "Failed to delete payment" });
    }
});

module.exports = router;
