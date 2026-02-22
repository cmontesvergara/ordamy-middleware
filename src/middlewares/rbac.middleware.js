/**
 * RBAC middleware to validate resource:action permissions from SSO session.
 * 
 * Usage: rbac("orders", "create")
 * 
 * This checks req.ssoSession for the user's permissions array.
 * Permissions come from SSO Core and follow the format { resource, action }.
 */
function rbac(resource, action) {
    return (req, res, next) => {
        try {
            const session = req.ssoSession;

            if (!session) {
                return res.status(401).json({ error: "No session found" });
            }

            // SuperAdmins bypass all RBAC checks
            if (session.user?.isSuperAdmin) {
                return next();
            }

            const permissions = session.tenant?.permissions || [];

            const hasPermission = permissions.some(
                (p) => p.resource === resource && p.action === action
            );

            if (!hasPermission) {
                return res.status(403).json({
                    error: "Forbidden",
                    message: `Missing permission: ${resource}:${action}`,
                });
            }

            next();
        } catch (error) {
            console.error("❌ RBAC Middleware Error:", error.message);
            res.status(500).json({ error: "Internal authorization error" });
        }
    };
}

module.exports = rbac;
