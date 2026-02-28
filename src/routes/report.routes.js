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
 * List orders with balance > 0 (cartera) with optional filters
 */
router.get("/portfolio", rbac("portfolio", "read"), async (req, res) => {
    try {
        const { dateFrom, dateTo, customerId, status } = req.query;

        const where = { balance: { gt: 0 } };

        // Default to ACTIVE only, but allow filtering by status
        if (status) {
            where.status = status;
        } else {
            where.status = "ACTIVE";
        }

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

        const orders = await req.prisma.order.findMany({
            where,
            orderBy: { orderDate: "asc" },
            include: {
                customer: { select: { id: true, name: true, identification: true, phone: true } },
            },
        });

        // Calculate days overdue for each order
        const now = new Date();
        const enriched = orders.map((o) => {
            const due = o.dueDate ? new Date(o.dueDate) : null;
            const daysOverdue = due ? Math.floor((now - due) / (1000 * 60 * 60 * 24)) : 0;
            return { ...o, daysOverdue };
        });

        const totalBalance = enriched.reduce((sum, o) => sum + parseFloat(o.balance), 0);

        res.json({ success: true, data: enriched, totalBalance, count: enriched.length });
    } catch (error) {
        console.error("❌ Error getting portfolio:", error.message);
        res.status(500).json({ error: "Failed to get portfolio" });
    }
});

/**
 * GET /api/reports/daily
 * Daily report: payments and expenses with breakdown by payment method
 */
router.get("/daily", rbac("reports", "read"), async (req, res) => {
    try {
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

        const dateFilter = { gte: startOfDay, lte: endOfDay };

        const [payments, expenses, ordersCreated] = await Promise.all([
            req.prisma.payment.findMany({
                where: { paymentDate: dateFilter },
                include: {
                    order: { select: { number: true, customer: { select: { name: true } } } },
                    paymentMethod: { select: { id: true, name: true } },
                },
                orderBy: { paymentDate: "asc" },
            }),
            req.prisma.expense.findMany({
                where: { expenseDate: dateFilter },
                include: {
                    category: { select: { name: true } },
                    paymentMethod: { select: { id: true, name: true } },
                    supplier: { select: { name: true } },
                },
                orderBy: { expenseDate: "asc" },
            }),
            req.prisma.order.count({
                where: { orderDate: dateFilter },
            }),
        ]);

        const totalIncome = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

        // D3: Group by payment method
        const incomeByMethod = {};
        payments.forEach((p) => {
            const name = p.paymentMethod?.name || "Sin medio";
            if (!incomeByMethod[name]) incomeByMethod[name] = { method: name, total: 0, count: 0 };
            incomeByMethod[name].total += parseFloat(p.amount);
            incomeByMethod[name].count += 1;
        });

        const expensesByMethod = {};
        expenses.forEach((e) => {
            const name = e.paymentMethod?.name || "Sin medio";
            if (!expensesByMethod[name]) expensesByMethod[name] = { method: name, total: 0, count: 0 };
            expensesByMethod[name].total += parseFloat(e.amount);
            expensesByMethod[name].count += 1;
        });

        res.json({
            success: true,
            data: {
                date: startOfDay.toISOString().split("T")[0],
                payments,
                expenses,
                totalIncome,
                totalExpense,
                net: totalIncome - totalExpense,
                ordersCreated,
                incomeByMethod: Object.values(incomeByMethod),
                expensesByMethod: Object.values(expensesByMethod),
            },
        });
    } catch (error) {
        console.error("❌ Error getting daily report:", error.message);
        res.status(500).json({ error: "Failed to get daily report" });
    }
});

/**
 * GET /api/reports/monthly
 * Monthly summary with breakdowns by payment method and expense category
 */
router.get("/monthly", rbac("reports", "read"), async (req, res) => {
    try {
        const { year, month } = req.query;
        const y = parseInt(year) || new Date().getFullYear();
        const m = parseInt(month) || new Date().getMonth() + 1;

        const startOfMonth = new Date(y, m - 1, 1);
        const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
        const dateFilter = { gte: startOfMonth, lte: endOfMonth };

        const [
            paymentsByMethod,
            expensesByCategory,
            expensesByMethod,
            ordersSummary,
            paymentMethods,
            categories,
        ] = await Promise.all([
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
            req.prisma.expense.groupBy({
                by: ["paymentMethodId"],
                where: { expenseDate: dateFilter },
                _sum: { amount: true },
                _count: true,
            }),
            req.prisma.order.aggregate({
                where: { orderDate: dateFilter },
                _sum: { total: true },
                _count: true,
            }),
            req.prisma.paymentMethod.findMany({ select: { id: true, name: true } }),
            req.prisma.category.findMany({ select: { id: true, name: true } }),
        ]);

        // Resolve names
        const methodMap = {};
        paymentMethods.forEach((pm) => { methodMap[pm.id] = pm.name; });
        const categoryMap = {};
        categories.forEach((c) => { categoryMap[c.id] = c.name; });

        const totalIncome = paymentsByMethod.reduce((sum, g) => sum + (g._sum.amount || 0), 0);
        const totalExpenses = expensesByCategory.reduce((sum, g) => sum + (g._sum.amount || 0), 0);

        res.json({
            success: true,
            data: {
                year: y,
                month: m,
                totalIncome,
                totalExpenses,
                netIncome: totalIncome - totalExpenses,
                ordersSummary: {
                    count: ordersSummary._count,
                    total: ordersSummary._sum.total || 0,
                },
                byMethod: paymentsByMethod.map((g) => ({
                    name: methodMap[g.paymentMethodId] || "Sin medio",
                    total: g._sum.amount || 0,
                    count: g._count,
                })),
                byCategory: expensesByCategory.map((g) => ({
                    name: categoryMap[g.categoryId] || "Sin categoría",
                    total: g._sum.amount || 0,
                    count: g._count,
                })),
                expensesByMethod: expensesByMethod.map((g) => ({
                    name: methodMap[g.paymentMethodId] || "Sin medio",
                    total: g._sum.amount || 0,
                    count: g._count,
                })),
            },
        });
    } catch (error) {
        console.error("❌ Error getting monthly report:", error.message);
        res.status(500).json({ error: "Failed to get monthly report" });
    }
});

module.exports = router;
