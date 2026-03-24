import express from "express";
import rbac from "../middlewares/rbac.middleware.js";
import { getDayBounds, getMonthBounds  } from "../utils/date.util.js";
import axios from "axios";

const router = express.Router();

// --- HELPER FUNCTIONS ---

async function getDailyData(prisma, tenantId, filterDate) {
    const config = await prisma.financialConfig.findFirst({
        where: { tenantId },
        select: { timezone: true }
    });
    const tz = config?.timezone || 'UTC';

    const bounds = getDayBounds(filterDate || null, tz);
    const startOfDay = bounds.startOfDay;
    const endOfDay = bounds.endOfDay;

    const dateFilter = { gte: startOfDay, lte: endOfDay };

    const [payments, expenses, ordersCreated] = await Promise.all([
        prisma.payment.findMany({
            where: { paymentDate: dateFilter },
            include: {
                order: { select: { number: true, customer: { select: { name: true } } } },
                paymentMethod: { select: { id: true, name: true } },
            },
            orderBy: { paymentDate: "asc" },
        }),
        prisma.expense.findMany({
            where: { expenseDate: dateFilter },
            include: {
                category: { select: { name: true } },
                paymentMethod: { select: { id: true, name: true } },
                supplier: { select: { name: true } },
            },
            orderBy: { expenseDate: "asc" },
        }),
        prisma.order.count({
            where: { orderDate: dateFilter },
        }),
    ]);

    const totalIncome = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    const incomeByMethodMap = {};
    payments.forEach((p) => {
        const name = p.paymentMethod?.name || "Sin medio";
        if (!incomeByMethodMap[name]) incomeByMethodMap[name] = { method: name, transactions: 0, total: 0 };
        incomeByMethodMap[name].total += parseFloat(p.amount);
        incomeByMethodMap[name].transactions += 1;
    });

    const expensesByMethodMap = {};
    expenses.forEach((e) => {
        const name = e.paymentMethod?.name || "Sin medio";
        if (!expensesByMethodMap[name]) expensesByMethodMap[name] = { method: name, transactions: 0, total: 0 };
        expensesByMethodMap[name].total += parseFloat(e.amount);
        expensesByMethodMap[name].transactions += 1;
    });

    return {
        date: startOfDay,
        dateString: bounds.dateUsed,
        payments,
        expenses,
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
        ordersCreated,
        incomeByMethodMap,
        expensesByMethodMap,
        incomeByMethod: Object.values(incomeByMethodMap).map(m => ({ ...m, count: m.transactions })),
        expensesByMethod: Object.values(expensesByMethodMap).map(m => ({ ...m, count: m.transactions }))
    };
}

async function getMonthlyData(prisma, tenantId, year, month) {
    const config = await prisma.financialConfig.findFirst({
        where: { tenantId },
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
        prisma.payment.groupBy({
            by: ["paymentMethodId"],
            where: { paymentDate: dateFilter },
            _sum: { amount: true },
            _count: true,
        }),
        prisma.expense.groupBy({
            by: ["categoryId"],
            where: { expenseDate: dateFilter },
            _sum: { amount: true },
            _count: true,
        }),
        prisma.expense.groupBy({
            by: ["paymentMethodId"],
            where: { expenseDate: dateFilter },
            _sum: { amount: true },
            _count: true,
        }),
        prisma.order.aggregate({
            where: { orderDate: dateFilter },
            _sum: { total: true },
            _count: true,
        }),
        prisma.paymentMethod.findMany({ select: { id: true, name: true } }),
        prisma.category.findMany({ select: { id: true, name: true } }),
    ]);

    const methodMap = {};
    paymentMethods.forEach((pm) => { methodMap[pm.id] = pm.name; });
    const categoryMap = {};
    categories.forEach((c) => { categoryMap[c.id] = c.name; });

    const totalIncome = paymentsByMethod.reduce((sum, g) => sum + Number(g._sum.amount || 0), 0);
    const totalExpenses = expensesByCategory.reduce((sum, g) => sum + Number(g._sum.amount || 0), 0);
    const netIncome = totalIncome - totalExpenses;

    const byMethod = paymentsByMethod.map((g) => ({
        name: methodMap[g.paymentMethodId] || "Sin medio",
        method: methodMap[g.paymentMethodId] || "Sin medio",
        total: Number(g._sum.amount || 0),
        count: g._count,
        transactions: g._count,
    }));

    const byCategory = expensesByCategory.map((g) => ({
        name: categoryMap[g.categoryId] || "Sin categoría",
        category: categoryMap[g.categoryId] || "Sin categoría",
        total: Number(g._sum.amount || 0),
        count: g._count,
        quantity: g._count,
    }));

    const exByMethod = expensesByMethod.map((g) => ({
        name: methodMap[g.paymentMethodId] || "Sin medio",
        method: methodMap[g.paymentMethodId] || "Sin medio",
        total: Number(g._sum.amount || 0),
        count: g._count,
        transactions: g._count,
    }));

    return {
        year: y,
        month: m,
        totalIncome,
        totalExpenses,
        netIncome,
        ordersSummary: {
            count: ordersSummary._count,
            total: Number(ordersSummary._sum.total || 0),
        },
        byMethod,
        byCategory,
        expensesByMethod: exByMethod,
    };
}

// ------------------------

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
        const data = await getDailyData(req.prisma, req.tenantId, date);

        res.json({
            success: true,
            data: {
                date: data.dateString,
                payments: data.payments,
                expenses: data.expenses,
                totalIncome: data.totalIncome,
                totalExpense: data.totalExpense,
                net: data.net,
                ordersCreated: data.ordersCreated,
                incomeByMethod: data.incomeByMethod,
                expensesByMethod: data.expensesByMethod,
            },
        });
    } catch (error) {
        console.error("❌ Error getting daily report:", error.message);
        res.status(500).json({ error: "Failed to get daily report" });
    }
});

/**
 * GET /api/reports/daily/pdf
 * Daily report exported as PDF via DocForge Ordamy t0000003002
 */
router.get("/daily/pdf", rbac("reports", "read"), async (req, res) => {
    try {
        const { date } = req.query;

        const tenant = await req.prisma.tenant.findUnique({
            where: { id: req.tenantId },
            select: { name: true }
        });

        const data = await getDailyData(req.prisma, req.tenantId, date);

        // Formato para la vista del documento DocForge
        const incomeByMethod = Object.values(data.incomeByMethodMap).map(m => ({ ...m, total: m.total.toString() }));
        const expensesByMethod = Object.values(data.expensesByMethodMap).map(m => ({ ...m, total: m.total.toString() }));

        const paymentsList = data.payments.map(p => ({
            orderNumber: p.order?.number || 0,
            customer: p.order?.customer?.name || "N/A",
            method: p.paymentMethod?.name || "Sin medio",
            amount: parseFloat(p.amount).toString()
        }));

        const expenseDetails = data.expenses.map(e => ({
            description: e.description || "N/A",
            category: e.category?.name || "N/A",
            method: e.paymentMethod?.name || "Sin medio",
            amount: parseFloat(e.amount).toString()
        }));

        const dateStr = data.dateString.split('-').reverse().join('/'); // DD/MM/YYYY

        const documentData = {
            companyName: tenant?.name || "ORDAMY SYSTEM",
            date: dateStr,
            amount: data.net.toString(),
            income: data.totalIncome.toString(),
            expenses: data.totalExpense.toString(),
            net: data.net.toString(),
            ordersCreated: data.ordersCreated,
            incomeByMethod,
            incomeTotalAmount: data.totalIncome.toString(),
            expensesByMethod,
            expensesTotalAmount: data.totalExpense.toString(),
            payments: paymentsList,
            expenseDetails,
            documentId: `CORTE-${dateStr.replace(/\//g, '')}`,
            signature: "N/A"
        };

        const docForgeUrl = process.env.DOC_FORGE_URL;
        const response = await axios.post(`${docForgeUrl}/api/generate/pdf`, {
            templateId: "t0000003002",
            documentData
        }, {
            responseType: 'stream'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="corte-diario-${dateStr.replace(/\//g, '-')}.pdf"`);
        response.data.pipe(res);

    } catch (error) {
        console.error("❌ Error generating daily PDF:", error.message);
        res.status(500).json({ error: "Failed to generate daily report PDF" });
    }
});

/**
 * GET /api/reports/monthly
 * Monthly summary with breakdowns by payment method and expense category
 */
router.get("/monthly", rbac("reports", "read"), async (req, res) => {
    try {
        const { year, month } = req.query;
        const data = await getMonthlyData(req.prisma, req.tenantId, year, month);

        res.json({
            success: true,
            data: {
                year: data.year,
                month: data.month,
                totalIncome: data.totalIncome,
                totalExpenses: data.totalExpenses,
                netIncome: data.netIncome,
                ordersSummary: data.ordersSummary,
                byMethod: data.byMethod,
                byCategory: data.byCategory,
                expensesByMethod: data.expensesByMethod,
            },
        });
    } catch (error) {
        console.error("❌ Error getting monthly report:", error.message);
        res.status(500).json({ error: "Failed to get monthly report" });
    }
});

/**
 * GET /api/reports/monthly/pdf
 * Monthly summary exported as PDF via DocForge Ordamy t0000003003
 */
router.get("/monthly/pdf", rbac("reports", "read"), async (req, res) => {
    try {
        const { year, month } = req.query;

        const tenant = await req.prisma.tenant.findUnique({
            where: { id: req.tenantId },
            select: { name: true }
        });

        const data = await getMonthlyData(req.prisma, req.tenantId, year, month);

        const incomeByMethodForm = data.byMethod.map((g) => ({
            method: g.method,
            total: g.total.toString(),
            transactions: g.transactions,
        }));

        const expensesByMethodForm = data.expensesByMethod.map((g) => ({
            method: g.method,
            total: g.total.toString(),
            transactions: g.transactions,
        }));

        const expensesByCategoryForm = data.byCategory.map((g) => ({
            category: g.category,
            total: g.total.toString(),
            quantity: g.quantity,
        }));

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const dateStr = `${monthNames[data.month - 1]} ${data.year}`;

        const documentData = {
            companyName: tenant?.name || "ORDAMY SYSTEM",
            date: dateStr,
            amount: data.netIncome.toString(),
            income: data.totalIncome.toString(),
            expenses: data.totalExpenses.toString(),
            net: data.netIncome.toString(),
            ordersCount: data.ordersSummary.count,
            ordersTotal: data.ordersSummary.total.toString(),
            incomeByMethod: incomeByMethodForm,
            incomeTotalAmount: data.totalIncome.toString(),
            expensesByMethod: expensesByMethodForm,
            expensesTotalAmount: data.totalExpenses.toString(),
            expensesByCategory: expensesByCategoryForm,
            documentId: `CORTE-${data.month}-${data.year}`,
            signature: "N/A"
        };

        const docForgeUrl = process.env.DOC_FORGE_URL;
        const response = await axios.post(`${docForgeUrl}/api/generate/pdf`, {
            templateId: "t0000003003",
            documentData
        }, {
            responseType: 'stream'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="corte-mensual-${data.month}-${data.year}.pdf"`);
        response.data.pipe(res);

    } catch (error) {
        console.error("❌ Error generating monthly PDF:", error.message);
        res.status(500).json({ error: "Failed to generate monthly report PDF" });
    }
});

export default router;
