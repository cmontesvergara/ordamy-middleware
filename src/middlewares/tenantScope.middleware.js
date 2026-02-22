const { PrismaClient } = require("@prisma/client");

/**
 * Middleware to inject tenantId scoping into Prisma queries.
 * Uses Prisma Client Extensions to automatically filter by tenant.
 * 
 * Requires req.tenant.tenantId to be set by ssoAuth middleware.
 */
function tenantScope(req, res, next) {
    if (!req.tenant || !req.tenant.tenantId) {
        return res.status(403).json({ error: "Tenant context not found" });
    }

    const tenantId = req.tenant.tenantId;

    // Create a scoped Prisma client that auto-filters by tenantId
    const prisma = new PrismaClient().$extends({
        query: {
            $allModels: {
                async findMany({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findFirst({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async findUnique({ args, query }) {
                    // For findUnique we add tenantId validation after query
                    const result = await query(args);
                    if (result && result.tenantId && result.tenantId !== tenantId) {
                        return null;
                    }
                    return result;
                },
                async create({ args, query }) {
                    args.data = { ...args.data, tenantId };
                    return query(args);
                },
                async update({ args, query }) {
                    args.where = { ...args.where };
                    return query(args);
                },
                async delete({ args, query }) {
                    args.where = { ...args.where };
                    return query(args);
                },
                async count({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
                async aggregate({ args, query }) {
                    args.where = { ...args.where, tenantId };
                    return query(args);
                },
            },
        },
    });

    req.prisma = prisma;
    req.tenantId = tenantId;

    next();
}

module.exports = tenantScope;
