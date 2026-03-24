import express from "express";
import rbac from "../middlewares/rbac.middleware.js";
import { getDayBounds  } from "../utils/date.util.js";

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

            const config = await req.prisma.financialConfig.findFirst({
                where: { tenantId: req.tenantId },
                select: { timezone: true }
            });
            const tz = config?.timezone || 'UTC';

            if (from) {
                const bounds = getDayBounds(from, tz);
                where.transactionDate.gte = bounds.startOfDay;
            }
            if (to) {
                const bounds = getDayBounds(to, tz);
                where.transactionDate.lte = bounds.endOfDay;
            }
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

export default router;
