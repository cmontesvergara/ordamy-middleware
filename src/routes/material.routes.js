import express from "express";
import rbac from "../middlewares/rbac.middleware.js";

const router = express.Router();

/**
 * GET /api/materials
 * List materials for the current tenant
 */
router.get("/", rbac("materials", "read"), async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (search) {
            where.name = { contains: search, mode: "insensitive" };
        }

        const [materials, total] = await Promise.all([
            req.prisma.material.findMany({
                where,
                skip,
                take: parseInt(limit),
                orderBy: { name: "asc" },
            }),
            req.prisma.material.count({ where }),
        ]);

        res.json({ success: true, data: materials, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        console.error("❌ Error listing materials:", error.message);
        res.status(500).json({ error: "Failed to list materials" });
    }
});

/**
 * GET /api/materials/:id
 */
router.get("/:id", rbac("materials", "read"), async (req, res) => {
    try {
        const material = await req.prisma.material.findFirst({
            where: { id: req.params.id },
        });

        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }

        res.json({ success: true, data: material });
    } catch (error) {
        console.error("❌ Error getting material:", error.message);
        res.status(500).json({ error: "Failed to get material" });
    }
});

/**
 * POST /api/materials
 */
router.post("/", rbac("materials", "create"), async (req, res) => {
    try {
        const { name, description, price, unit } = req.body;

        if (!name) {
            return res.status(400).json({ error: "name is required" });
        }

        const material = await req.prisma.material.create({
            data: { name, description, price: price || 0, unit },
        });

        res.status(201).json({ success: true, data: material });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({ error: "Material with this name already exists" });
        }
        console.error("❌ Error creating material:", error.message);
        res.status(500).json({ error: "Failed to create material" });
    }
});

/**
 * PUT /api/materials/:id
 */
router.put("/:id", rbac("materials", "update"), async (req, res) => {
    try {
        const { name, description, price, unit, isActive } = req.body;

        const material = await req.prisma.material.update({
            where: { id: req.params.id },
            data: { name, description, price, unit, isActive },
        });

        res.json({ success: true, data: material });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Material not found" });
        }
        console.error("❌ Error updating material:", error.message);
        res.status(500).json({ error: "Failed to update material" });
    }
});

/**
 * DELETE /api/materials/:id
 */
router.delete("/:id", rbac("materials", "delete"), async (req, res) => {
    try {
        await req.prisma.material.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true, message: "Material deleted" });
    } catch (error) {
        if (error.code === "P2025") {
            return res.status(404).json({ error: "Material not found" });
        }
        console.error("❌ Error deleting material:", error.message);
        res.status(500).json({ error: "Failed to delete material" });
    }
});

export default router;
