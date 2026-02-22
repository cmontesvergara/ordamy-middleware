const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/reports/dashboard
 * Dashboard summary: total sales, total expenses, accounts summary, portfolio
 */
router.get("/dashboard", rbac("dashboard", "read"), async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            totalSalesMonth,
            totalExpensesMonth,
            activeOrdersCount,
            portfolioBalance,
            accounts,
        ] = await Promise.all([
            req.prisma.payment.aggregate({
                where: { paymentDate: { gte: startOfMonth } },
                _sum: { amount: true },
            }),
            req.prisma.expense.aggregate({
                where: { expenseDate: { gte: startOfMonth } },
                _sum: { amount: true },
            }),
            req.prisma.order.count({
                where: { status: "ACTIVE" },
            }),
            req.prisma.order.aggregate({
                where: { status: "ACTIVE", balance: { gt: 0 } },
                _sum: { balance: true },
            }),
            req.prisma.account.findMany({
                include: { paymentMethod: { select: { name: true } } },
            }),
        ]);

        res.json({
            success: true,
            data: {
                salesThisMonth: totalSalesMonth._sum.amount || 0,
                expensesThisMonth: totalExpensesMonth._sum.amount || 0,
                activeOrders: activeOrdersCount,
                portfolioBalance: portfolioBalance._sum.balance || 0,
                accounts: accounts.map((a) => ({
                    id: a.id,
                    name: a.paymentMethod.name,
                    balance: a.balance,
                })),
            },
        });
    } catch (error) {
        console.error("❌ Error getting dashboard:", error.message);
        res.status(500).json({ error: "Failed to get dashboard data" });
    }
});

/**
 * GET /api/reports/portfolio
 * List orders with balance > 0 (cartera)
 */
router.get("/portfolio", rbac("portfolio", "read"), async (req, res) => {
    try {
        const orders = await req.prisma.order.findMany({
            where: { status: "ACTIVE", balance: { gt: 0 } },
            orderBy: { orderDate: "asc" },
            include: {
                customer: { select: { id: true, name: true, identification: true, phone: true } },
            },
        });

        const totalBalance = orders.reduce((sum, o) => sum + parseFloat(o.balance), 0);

        res.json({ success: true, data: orders, totalBalance });
    } catch (error) {
        console.error("❌ Error getting portfolio:", error.message);
        res.status(500).json({ error: "Failed to get portfolio" });
    }
});

/**
 * GET /api/reports/daily
 * Daily report: payments and expenses for a given date
 */
router.get("/daily", rbac("reports", "read"), async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

        const dateFilter = { gte: startOfDay, lte: endOfDay };

        const [payments, expenses] = await Promise.all([
            req.prisma.payment.findMany({
                where: { paymentDate: dateFilter },
                include: {
                    order: { select: { number: true } },
                    paymentMethod: { select: { name: true } },
                },
                orderBy: { paymentDate: "asc" },
            }),
            req.prisma.expense.findMany({
                where: { expenseDate: dateFilter },
                include: {
                    category: { select: { name: true } },
                    paymentMethod: { select: { name: true } },
                },
                orderBy: { expenseDate: "asc" },
            }),
        ]);

        const totalIncome = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

        res.json({
            success: true,
            data: {
                date: startOfDay.toISOString().split("T")[0],
                payments,
                expenses,
                totalIncome,
                totalExpense,
                net: totalIncome - totalExpense,
            },
        });
    } catch (error) {
        console.error("❌ Error getting daily report:", error.message);
        res.status(500).json({ error: "Failed to get daily report" });
    }
});

/**
 * GET /api/reports/monthly
 * Monthly summary: totals by payment method
 */
router.get("/monthly", rbac("reports", "read"), async (req, res) => {
    try {
        const { year, month } = req.query;
        const y = parseInt(year) || new Date().getFullYear();
        const m = parseInt(month) || new Date().getMonth() + 1;

        const startOfMonth = new Date(y, m - 1, 1);
        const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
        const dateFilter = { gte: startOfMonth, lte: endOfMonth };

        const [paymentsByMethod, expensesByCategory, ordersSummary] = await Promise.all([
            req.prisma.payment.groupBy({
                by: ["paymentMethodId"],
                where: { paymentDate: dateFilter },
                _sum: { amount: true },
                _count: true,
            }),
            req.prisma.expense.groupBy({
                by: ["categoryId"],
                where: { expenseDate: dateFilter },
                _sum: { amount: true },
                _count: true,
            }),
            req.prisma.order.aggregate({
                where: { orderDate: dateFilter },
                _sum: { total: true },
                _count: true,
            }),
        ]);

        res.json({
            success: true,
            data: {
                year: y,
                month: m,
                paymentsByMethod,
                expensesByCategory,
                ordersSummary: {
                    count: ordersSummary._count,
                    total: ordersSummary._sum.total || 0,
                },
            },
        });
    } catch (error) {
        console.error("❌ Error getting monthly report:", error.message);
        res.status(500).json({ error: "Failed to get monthly report" });
    }
});

module.exports = router;
