const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    console.log("🌱 Seeding Ordamy database...");

    // This seed is for development purposes only.
    // In production, tenants are created via SSO sync.

    // Create a dev tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: "demo" },
        update: {},
        create: {
            ssoId: "00000000-0000-0000-0000-000000000001",
            name: "Demo Tenant",
            slug: "demo",
            isActive: true,
        },
    });

    console.log(`   ✅ Tenant: ${tenant.name} (${tenant.id})`);

    // Payment Methods
    const paymentMethods = ["Efectivo", "Nequi", "Bancolombia"];
    const createdMethods = [];
    for (const name of paymentMethods) {
        const method = await prisma.paymentMethod.upsert({
            where: { tenantId_name: { tenantId: tenant.id, name } },
            update: {},
            create: { tenantId: tenant.id, name },
        });
        createdMethods.push(method);
    }
    console.log(`   ✅ Payment Methods: ${createdMethods.length}`);

    // Categories
    const categories = [
        { name: "Servicios", type: "EXPENSE" },
        { name: "Materiales", type: "EXPENSE" },
        { name: "Transporte", type: "EXPENSE" },
        { name: "Otros", type: "BOTH" },
    ];
    for (const cat of categories) {
        await prisma.category.upsert({
            where: { tenantId_name: { tenantId: tenant.id, name: cat.name } },
            update: {},
            create: { tenantId: tenant.id, name: cat.name, type: cat.type },
        });
    }
    console.log(`   ✅ Categories: ${categories.length}`);

    // Accounts (one per payment method)
    for (const method of createdMethods) {
        await prisma.account.upsert({
            where: {
                tenantId_paymentMethodId: {
                    tenantId: tenant.id,
                    paymentMethodId: method.id,
                },
            },
            update: {},
            create: {
                tenantId: tenant.id,
                paymentMethodId: method.id,
                balance: 0,
            },
        });
    }
    console.log(`   ✅ Accounts: ${createdMethods.length}`);

    // Tax Config
    await prisma.taxConfig.upsert({
        where: { tenantId_name: { tenantId: tenant.id, name: "IVA 19%" } },
        update: {},
        create: {
            tenantId: tenant.id,
            name: "IVA 19%",
            rate: 0.19,
            isDefault: true,
        },
    });
    console.log("   ✅ Tax Config: IVA 19%");

    // Financial Config
    await prisma.financialConfig.upsert({
        where: { tenantId: tenant.id },
        update: {},
        create: {
            tenantId: tenant.id,
            graceDays: 30,
            currency: "COP",
            timezone: "America/Bogota",
        },
    });
    console.log("   ✅ Financial Config");

    console.log("");
    console.log("🎉 Seed completed!");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
