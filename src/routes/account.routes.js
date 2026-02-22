const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/accounts
 * List all accounts (one per payment method) with balances
 */
router.get("/", rbac("cashier", "read"), async (req, res) => {
    try {
        const accounts = await req.prisma.account.findMany({
            include: {
                paymentMethod: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "asc" },
        });

        res.json({ success: true, data: accounts });
    } catch (error) {
        console.error("❌ Error listing accounts:", error.message);
        res.status(500).json({ error: "Failed to list accounts" });
    }
});

/**
 * GET /api/accounts/:id/transactions
 * List transactions for a specific account
 */
router.get("/:id/transactions", rbac("cashier", "read"), async (req, res) => {
    try {
        const { from, to, page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = { accountId: req.params.id };
        if (from || to) {
            where.transactionDate = {};
            if (from) where.transactionDate.gte = new Date(from);
            if (to) where.transactionDate.lte = new Date(to);
        }

        const [transactions, total] = await Promise.all([
            req.prisma.transaction.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { transactionDate: "desc" },
            }),
            req.prisma.transaction.count({ where }),
        ]);

        res.json({ success: true, data: transactions, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing transactions:", error.message);
        res.status(500).json({ error: "Failed to list transactions" });
    }
});

module.exports = router;
