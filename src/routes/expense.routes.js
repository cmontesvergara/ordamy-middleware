const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/expenses
 * List expenses with filters
 */
router.get("/", rbac("expenses", "read"), async (req, res) => {
    try {
        const { categoryId, supplierId, from, to, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (categoryId) where.categoryId = categoryId;
        if (supplierId) where.supplierId = supplierId;
        if (from || to) {
            where.expenseDate = {};
            if (from) where.expenseDate.gte = new Date(from);
            if (to) where.expenseDate.lte = new Date(to);
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
