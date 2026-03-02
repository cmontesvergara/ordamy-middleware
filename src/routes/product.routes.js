const express = require("express");
const rbac = require("../middlewares/rbac.middleware");

const router = express.Router();

/**
 * GET /api/products
 * List products for the current tenant
 */
router.get("/", rbac("products", "read"), async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (search) {
            where.name = { contains: search, mode: "insensitive" };
        }

        const [products, total] = await Promise.all([
            req.prisma.product.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { name: "asc" },
            }),
            req.prisma.product.count({ where }),
        ]);

        res.json({ success: true, data: products, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing products:", error.message);
        res.status(500).json({ error: "Failed to list products" });
    }
});

/**
 * GET /api/products/:id
 */
router.get("/:id", rbac("products", "read"), async (req, res) => {
    try {
        const product = await req.prisma.product.findFirst({
            where: { id: req.params.id },
        });

        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        console.error("❌ Error getting product:", error.message);
        res.status(500).json({ error: "Failed to get product" });
    }
});

/**
 * POST /api/products
 */
router.post("/", rbac("products", "create"), async (req, res) => {
    try {
        const { name, description, basePrice, unit } = req.body;

        if (!name) {
            return res.status(400).json({ error: "name is required" });
        }

        const product = await req.prisma.product.create({
            data: { name, description, basePrice: basePrice || 0, unit },
        });

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Product with this name already exists" });
        }
        console.error("❌ Error creating product:", error.message);
        res.status(500).json({ error: "Failed to create product" });
    }
});

/**
 * PUT /api/products/:id
 */
router.put("/:id", rbac("products", "update"), async (req, res) => {
    try {
        const { name, description, basePrice, unit, isActive } = req.body;

        const product = await req.prisma.product.update({
            where: { id: req.params.id },
            data: { name, description, basePrice, unit, isActive },
        });

        res.json({ success: true, data: product });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Product not found" });
        }
        console.error("❌ Error updating product:", error.message);
        res.status(500).json({ error: "Failed to update product" });
    }
});

module.exports = router;
