const express = require("express");
const rbac = require("../middlewares/rbac.middleware");
const { getDayBounds } = require("../utils/date.util");

const router = express.Router();

/**
 * GET /api/expenses
 * List expenses with filters
 */
router.get("/", rbac("expenses", "read"), async (req, res) => {
    try {
        const { categoryId, supplierId, search, from, to, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (categoryId) where.categoryId = categoryId;
        if (supplierId) where.supplierId = supplierId;
        if (from || to) {
            where.expenseDate = {};

            const config = await req.prisma.financialConfig.findFirst({
                where: { tenantId: req.tenantId },
                select: { timezone: true }
            });
            const tz = config?.timezone || 'UTC';

            if (from) {
                const bounds = getDayBounds(from, tz);
                where.expenseDate.gte = bounds.startOfDay;
            }
            if (to) {
                const bounds = getDayBounds(to, tz);
                where.expenseDate.lte = bounds.endOfDay;
            }
        }
        if (search) {
            where.OR = [
                { description: { contains: search, mode: "insensitive" } },
                { invoiceNumber: { contains: search, mode: "insensitive" } },
                { supplier: { name: { contains: search, mode: "insensitive" } } },
            ];
        }

        const [expenses, total] = await Promise.all([
            req.prisma.expense.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { expenseDate: "desc" },
                include: {
                    category: { select: { id: true, name: true } },
                    supplier: { select: { id: true, name: true } },
                    paymentMethod: { select: { id: true, name: true } },
                },
            }),
            req.prisma.expense.count({ where }),
        ]);

        res.json({ success: true, data: expenses, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing expenses:", error.message);
        res.status(500).json({ error: "Failed to list expenses" });
    }
});

/**
 * GET /api/expenses/:id
 */
router.get("/:id", rbac("expenses", "read"), async (req, res) => {
    try {
        const expense = await req.prisma.expense.findFirst({
            where: { id: req.params.id },
            include: {
                category: true,
                supplier: true,
                paymentMethod: true,
                attachments: { orderBy: { createdAt: "desc" } },
            },
        });

        if (!expense) {
            return res.status(404).json({ error: "Expense not found" });
        }

        res.json({ success: true, data: expense });
    } catch (error) {
        console.error("❌ Error getting expense:", error.message);
        res.status(500).json({ error: "Failed to get expense" });
    }
});

/**
 * POST /api/expenses
 */
router.post("/", rbac("expenses", "create"), async (req, res) => {
    try {
        const {
            expenseDate,
            description,
            amount,
            invoiceNumber,
            supplierId,
            paymentMethodId,
            categoryId,
            notes,
        } = req.body;

        if (!description || !amount || !paymentMethodId || !categoryId) {
            return res.status(400).json({
                error: "description, amount, paymentMethodId and categoryId are required",
            });
        }

        const result = await req.prisma.$transaction(async (tx) => {
            // Validate payment method
            const pm = await tx.paymentMethod.findFirst({
                where: { id: paymentMethodId, tenantId: req.tenantId },
            });
            if (!pm || !pm.isActive) {
                throw new Error("El medio de pago seleccionado no está activo o no existe.");
            }

            const maxExpense = await tx.expense.findFirst({
                where: { tenantId: req.tenantId },
                orderBy: { number: "desc" },
                select: { number: true },
            });

            const nextNumber = (maxExpense?.number || 0) + 1;

            const expense = await tx.expense.create({
                data: {
                    tenantId: req.tenantId,
                    number: nextNumber,
                    expenseDate: expenseDate ? new Date(expenseDate) : new Date(),
                    description,
                    amount,
                    invoiceNumber,
                    supplierId,
                    paymentMethodId,
                    categoryId,
                    registeredBy: req.user.userId,
                    notes,
                },
                include: {
                    category: { select: { id: true, name: true } },
                    supplier: { select: { id: true, name: true } },
                    paymentMethod: { select: { id: true, name: true } },
                },
            });

            return expense;
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        console.error("❌ Error creating expense:", error.message);
        res.status(500).json({ error: "Failed to create expense" });
    }
});

/**
 * PUT /api/expenses/:id
 * Edit an expense
 */
router.put("/:id", rbac("expenses", "edit"), async (req, res) => {
    try {
        const { description, amount, categoryId, supplierId, paymentMethodId, invoiceNumber, expenseDate, notes } = req.body;

        const expense = await req.prisma.expense.findFirst({
            where: { id: req.params.id, tenantId: req.tenantId },
        });

        if (!expense) {
            return res.status(404).json({ error: "Expense not found" });
        }

        if (paymentMethodId) {
            const pm = await req.prisma.paymentMethod.findFirst({
                where: { id: paymentMethodId, tenantId: req.tenantId },
            });
            if (!pm || !pm.isActive) {
                return res.status(400).json({ error: "El medio de pago seleccionado no está activo o no existe." });
            }
        }

        const updated = await req.prisma.expense.update({
            where: { id: req.params.id },
            data: {
                ...(description !== undefined && { description }),
                ...(amount !== undefined && { amount: parseFloat(amount) }),
                ...(categoryId !== undefined && { categoryId: categoryId || null }),
                ...(supplierId !== undefined && { supplierId: supplierId || null }),
                ...(paymentMethodId !== undefined && { paymentMethodId }),
                ...(invoiceNumber !== undefined && { invoiceNumber }),
                ...(expenseDate !== undefined && { expenseDate: expenseDate ? new Date(expenseDate) : new Date() }),
                ...(notes !== undefined && { notes }),
            },
            include: {
                category: { select: { id: true, name: true } },
                supplier: { select: { id: true, name: true } },
                paymentMethod: { select: { id: true, name: true } },
            },
        });

        res.json({ success: true, data: updated });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Expense not found" });
        }
        console.error("❌ Error updating expense:", error.message);
        res.status(500).json({ error: "Failed to update expense" });
    }
});

/**
 * DELETE /api/expenses/:id
 */
router.delete("/:id", rbac("expenses", "delete"), async (req, res) => {
    try {
        await req.prisma.expense.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true, message: "Expense deleted" });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Expense not found" });
        }
        console.error("❌ Error deleting expense:", error.message);
        res.status(500).json({ error: "Failed to delete expense" });
    }
});

module.exports = router;
