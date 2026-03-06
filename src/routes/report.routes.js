const express = require("express");
const rbac = require("../middlewares/rbac.middleware");
const { getDayBounds, getMonthBounds } = require("../utils/date.util");

const router = express.Router();

/**
 * GET /api/reports/dashboard
 * Statistics: KPIs, comparisons, top clients, expense breakdown, operational status
 */
router.get("/dashboard", rbac("dashboard", "read"), async (req, res) => {
    try {
        const config = await req.prisma.financialConfig.findFirst({
            where: { tenantId: req.tenantId },
            select: { timezone: true }
        });
        const tz = config?.timezone || 'UTC';

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;

        const thisMonthBounds = getMonthBounds(currentYear, currentMonth, tz);

        let prevMonth = currentMonth - 1;
        let prevYear = currentYear;
        if (prevMonth === 0) {
            prevMonth = 12;
            prevYear -= 1;
        }
        const lastMonthBounds = getMonthBounds(prevYear, prevMonth, tz);

        const startOfMonth = thisMonthBounds.startOfMonth;
        const startOfLastMonth = lastMonthBounds.startOfMonth;
        const endOfLastMonth = lastMonthBounds.endOfMonth;

        const [
            salesThisMonth,
            salesLastMonth,
            expensesThisMonth,
            expensesLastMonth,
            activeOrdersCount,
            portfolioBalance,
            accounts,
            customersThisMonth,
            topClientsBySales,
            topClientsWithDebt,
            expensesByCategory,
            ordersByOpStatus,
        ] = await Promise.all([
            // Sales this month
            req.prisma.payment.aggregate({
                where: { paymentDate: { gte: startOfMonth } },
                _sum: { amount: true },
            }),
            // Sales last month
            req.prisma.payment.aggregate({
                where: { paymentDate: { gte: startOfLastMonth, lte: endOfLastMonth } },
                _sum: { amount: true },
            }),
            // Expenses this month
            req.prisma.expense.aggregate({
                where: { expenseDate: { gte: startOfMonth } },
                _sum: { amount: true },
            }),
            // Expenses last month
            req.prisma.expense.aggregate({
                where: { expenseDate: { gte: startOfLastMonth, lte: endOfLastMonth } },
                _sum: { amount: true },
            }),
            // Active orders
            req.prisma.order.count({ where: { status: "ACTIVE" } }),
            // Portfolio balance
            req.prisma.order.aggregate({
                where: { status: "ACTIVE", balance: { gt: 0 } },
                _sum: { balance: true },
            }),
            // Accounts
            req.prisma.account.findMany({
                include: { paymentMethod: { select: { name: true } } },
            }),
            // Distinct customers this month
            req.prisma.order.findMany({
                where: { orderDate: { gte: startOfMonth } },
                select: { customerId: true },
                distinct: ["customerId"],
            }),
            // Top 5 clients by total orders this month
            req.prisma.order.groupBy({
                by: ["customerId"],
                where: { orderDate: { gte: startOfMonth }, status: { not: "CANCELLED" } },
                _sum: { total: true },
                _count: true,
                orderBy: { _sum: { total: "desc" } },
                take: 5,
            }),
            // Top 5 clients with most debt
            req.prisma.order.groupBy({
                by: ["customerId"],
                where: { status: "ACTIVE", balance: { gt: 0 } },
                _sum: { balance: true },
                _count: true,
                orderBy: { _sum: { balance: "desc" } },
                take: 5,
            }),
            // Expenses by category this month
            req.prisma.expense.groupBy({
                by: ["categoryId"],
                where: { expenseDate: { gte: startOfMonth } },
                _sum: { amount: true },
                _count: true,
            }),
            // Orders by operational status
            req.prisma.order.groupBy({
                by: ["operationalStatus"],
                where: { status: "ACTIVE" },
                _count: true,
            }),
        ]);

        // Resolve customer names for top lists
        const allCustomerIds = [
            ...topClientsBySales.map((c) => c.customerId),
            ...topClientsWithDebt.map((c) => c.customerId),
        ].filter(Boolean);
        const uniqueCustomerIds = [...new Set(allCustomerIds)];
        const customers = uniqueCustomerIds.length > 0
            ? await req.prisma.customer.findMany({
                where: { id: { in: uniqueCustomerIds } },
                select: { id: true, name: true, identification: true },
            })
            : [];
        const customerMap = Object.fromEntries(customers.map((c) => [c.id, c]));

        // Resolve category names
        const categoryIds = expensesByCategory.map((e) => e.categoryId).filter(Boolean);
        const categories = categoryIds.length > 0
            ? await req.prisma.category.findMany({
                where: { id: { in: categoryIds } },
                select: { id: true, name: true },
            })
            : [];
        const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c]));

        const sales = salesThisMonth._sum.amount || 0;
        const expenses = expensesThisMonth._sum.amount || 0;
        const salesPrev = salesLastMonth._sum.amount || 0;
        const expensesPrev = expensesLastMonth._sum.amount || 0;

        res.json({
            success: true,
            data: {
                // KPIs
                salesThisMonth: sales,
                salesLastMonth: salesPrev,
                salesChange: salesPrev > 0 ? ((sales - salesPrev) / Number(salesPrev)) * 100 : null,
                expensesThisMonth: expenses,
                expensesLastMonth: expensesPrev,
                expensesChange: expensesPrev > 0 ? ((expenses - expensesPrev) / Number(expensesPrev)) * 100 : null,
                profitThisMonth: sales - expenses,
                activeOrders: activeOrdersCount,
                portfolioBalance: portfolioBalance._sum.balance || 0,
                customersThisMonth: customersThisMonth.length,

                // Accounts
                accounts: accounts.map((a) => ({
                    id: a.id,
                    name: a.paymentMethod.name,
                    balance: a.balance,
                })),

                // Top clients
                topClientsBySales: topClientsBySales.map((c) => ({
                    ...customerMap[c.customerId],
                    totalSales: c._sum.total || 0,
                    orderCount: c._count,
                })),
                topClientsWithDebt: topClientsWithDebt.map((c) => ({
                    ...customerMap[c.customerId],
                    totalDebt: c._sum.balance || 0,
                    orderCount: c._count,
                })),

                // Expense breakdown
                expensesByCategory: expensesByCategory.map((e) => ({
                    categoryName: categoryMap[e.categoryId]?.name || "Sin categoría",
                    total: e._sum.amount || 0,
                    count: e._count,
                })),

                // Operational status breakdown
                ordersByOperationalStatus: ordersByOpStatus.map((o) => ({
                    status: o.operationalStatus,
                    count: o._count,
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
        const { dateFrom, dateTo, customerId, status, page = 1, limit = 20 } = req.query;

        const where = { balance: { gt: 0 } };

        // Default to ACTIVE only, but allow filtering by status
        if (status) {
            where.status = status;
        } else {
            where.status = "ACTIVE";
        }

        if (customerId) where.customerId = customerId;

        const config = await req.prisma.financialConfig.findFirst({
            where: { tenantId: req.tenantId },
            select: { timezone: true }
        });
        const tz = config?.timezone || 'UTC';

        if (dateFrom || dateTo) {
            where.orderDate = {};
            if (dateFrom) {
                const bounds = getDayBounds(dateFrom, tz);
                where.orderDate.gte = bounds.startOfDay;
            }
            if (dateTo) {
                const bounds = getDayBounds(dateTo, tz);
                where.orderDate.lte = bounds.endOfDay;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [orders, totalOrders, balanceAgg] = await Promise.all([
            req.prisma.order.findMany({
                where,
                orderBy: { dueDate: "asc" },
                skip,
                take,
                include: {
                    customer: { select: { id: true, name: true, identification: true, phone: true } },
                },
            }),
            req.prisma.order.count({ where }),
            req.prisma.order.aggregate({
                where,
                _sum: { balance: true }
            })
        ]);

        // Calculate days overdue for each order
        const now = new Date();
        const enriched = orders.map((o) => {
            const due = o.dueDate ? new Date(o.dueDate) : null;
            const daysOverdue = due ? Math.floor((now - due) / (1000 * 60 * 60 * 24)) : 0;
            return { ...o, daysOverdue };
        });

        const totalBalance = balanceAgg._sum.balance || 0;
        const pages = Math.ceil(totalOrders / take);

        res.json({ success: true, data: enriched, totalBalance, count: totalOrders, page: parseInt(page), pages });
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

        const config = await req.prisma.financialConfig.findFirst({
            where: { tenantId: req.tenantId },
            select: { timezone: true }
        });
        const tz = config?.timezone || 'UTC';

        const bounds = getDayBounds(date || null, tz);

        const startOfDay = bounds.startOfDay;
        const endOfDay = bounds.endOfDay;

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

        const config = await req.prisma.financialConfig.findFirst({
            where: { tenantId: req.tenantId },
            select: { timezone: true }
        });
        const tz = config?.timezone || 'UTC';

        const bounds = getMonthBounds(year || null, month || null, tz);
        const startOfMonth = bounds.startOfMonth;
        const endOfMonth = bounds.endOfMonth;

        const y = parseInt(bounds.yearAndMonth.split('-')[0]);
        const m = parseInt(bounds.yearAndMonth.split('-')[1]);

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

        const totalIncome = paymentsByMethod.reduce((sum, g) => sum + Number(g._sum.amount || 0), 0);
        const totalExpenses = expensesByCategory.reduce((sum, g) => sum + Number(g._sum.amount || 0), 0);

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
                    total: Number(ordersSummary._sum.total || 0),
                },
                byMethod: paymentsByMethod.map((g) => ({
                    name: methodMap[g.paymentMethodId] || "Sin medio",
                    total: Number(g._sum.amount || 0),
                    count: g._count,
                })),
                byCategory: expensesByCategory.map((g) => ({
                    name: categoryMap[g.categoryId] || "Sin categoría",
                    total: Number(g._sum.amount || 0),
                    count: g._count,
                })),
                expensesByMethod: expensesByMethod.map((g) => ({
                    name: methodMap[g.paymentMethodId] || "Sin medio",
                    total: Number(g._sum.amount || 0),
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
