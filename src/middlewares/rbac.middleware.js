export default function rbac(resource, action) {
    return (req, res, next) => {
        try {
            if (!req.tokenPayload) {
                return res.status(401).json({ error: "No session found" });
            }

            if (req.tokenPayload.systemRole === 'super_admin' || req.tokenPayload.systemRole === 'system_admin') {
                return next();
            }

            const permissions = req.tenant?.permissions || [];

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
            console.error("RBAC Middleware Error:", error.message);
            res.status(500).json({ error: "Internal authorization error" });
        }
    };
}
