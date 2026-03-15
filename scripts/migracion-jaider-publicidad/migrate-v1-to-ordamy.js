const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

// ==========================================
// CONFIGURACIÓN - EDITAR ANTES DE EJECUTAR
// ==========================================
const CONFIG = {
    PB_URL: 'https://jp-db.bigso.co',
    PB_ADMIN_EMAIL: 'camontesvergara@gmail.com',        // TODO: EDITAR
    PB_ADMIN_PASSWORD: '@Password21',         // TODO: EDITAR
    TARGET_TENANT_ID: 'ee812ba5-c42e-4b2b-b431-404caf550777',  // TODO: EDITAR (Verificar en BD que exista)
    DEFAULT_SELLER_ID: 'e54e0b6c-a861-4838-bfdc-6d299aa449a7',            // TODO: EDITAR (Identificador del vendedor)
    DEFAULT_SELLER_NAME: 'MIGRACION AUTOMATICA'        // TODO: EDITAR
};

// Autenticación de PocketBase
async function authenticatePB() {
    console.log('Autenticando en PocketBase...');
    try {
        const res = await axios.post(`${CONFIG.PB_URL}/api/admins/auth-via-email`, {
            email: CONFIG.PB_ADMIN_EMAIL,
            password: CONFIG.PB_ADMIN_PASSWORD
        });
        return res.data.token;
    } catch (error) {
        console.error('Error autenticando en PocketBase:', error.response?.data || error.message);
        process.exit(1);
    }
}

// Helper para descargar todos los registros de una colección
async function fetchAllRecords(collection, token) {
    let records = [];
    let page = 1;
    while (true) {
        const res = await axios.get(`${CONFIG.PB_URL}/api/collections/${collection}/records`, {
            headers: { Authorization: `Admin ${token}` },
            params: { page, perPage: 100 }
        });
        records.push(...res.data.items);
        if (page >= res.data.totalPages || res.data.items.length === 0) break;
        page++;
    }
    return records;
}

// Variables globales para mapear IDs cacheados
const cache = {
    customers: {}, // pbId -> prismaId
    paymentMethods: {}, // name -> prismaId
    categories: {}, // name -> prismaId
    suppliers: {}, // name -> prismaId
    orders: {} // pbId -> prismaId
};

async function main() {
    console.log('Iniciando migración desde PocketBase a Ordamy (Prisma)...');
    const token = await authenticatePB();

    // Validar Tenant

    const tenant = await prisma.tenant.findUnique({
        where: { id: CONFIG.TARGET_TENANT_ID }
    });
    if (!tenant) {
        console.error(`ERROR: Tenant con ID ${CONFIG.TARGET_TENANT_ID} no encontrado.`);
        process.exit(1);
    }
    console.log(`Tenant validado: ${tenant.name}`);

    // 1. MIGRACIÓN DE CUENTAS -> PAYMENT METHODS & ACCOUNTS
    //console.log('\n--- 1. Migrando Cuentas / Payment Methods ---');
    //const pbCuentas = await fetchAllRecords('cuentas', token);
    // Según el código viejo (api.ts), hay 1 registro en cuentas con columnas nequi, bancolombia, efectivo, davivienda.
    // if (pbCuentas.length > 0) {
    //     const cuentaRow = pbCuentas[0];
    //     const methods = ['nequi', 'bancolombia', 'efectivo', 'davivienda'];

    //     for (const method of methods) {
    //         if (cuentaRow[method] !== undefined) {
    //             // Upsert PaymentMethod
    //             const pm = await prisma.paymentMethod.upsert({
    //                 where: { tenantId_name: { tenantId: CONFIG.TARGET_TENANT_ID, name: method.toUpperCase() } },
    //                 update: {},
    //                 create: { tenantId: CONFIG.TARGET_TENANT_ID, name: method.toUpperCase(), isActive: true }
    //             });
    //             cache.paymentMethods[method] = pm.id;

    //             // Upsert Account para este Payment Method
    //             await prisma.account.upsert({
    //                 where: { tenantId_paymentMethodId: { tenantId: CONFIG.TARGET_TENANT_ID, paymentMethodId: pm.id } },
    //                 update: { balance: cuentaRow[method] },
    //                 create: { tenantId: CONFIG.TARGET_TENANT_ID, paymentMethodId: pm.id, balance: cuentaRow[method] }
    //             });
    //             console.log(`Migrada cuenta: ${method.toUpperCase()} con saldo ${cuentaRow[method]}`);
    //         }
    //     }
    // }

    // 2. MIGRACIÓN DE CLIENTES -> CUSTOMERS
    console.log('\n--- 2. Migrando Clientes ---');
    const pbClientes = await fetchAllRecords('clientes', token); // asumiendo 'clientes' por api.ts
    for (const c of pbClientes) {
        // Upsert usando NIT/ID (identificación)
        const identification = c.nit || c.id; // Fallback al id de PB si no hay NIT
        try {
            const customer = await prisma.customer.upsert({
                where: { tenantId_identification: { tenantId: CONFIG.TARGET_TENANT_ID, identification } },
                update: {
                    name: c.name || 'Sin nombre',
                    phone: null,
                    email: null,
                    address: null,
                },
                create: {
                    tenantId: CONFIG.TARGET_TENANT_ID,
                    identification,
                    name: c.name || 'Sin nombre',
                    phone: null,
                    email: null,
                    address: null,
                    createdAt: new Date(c.created)
                }
            });
            cache.customers[c.id] = customer.id;
        } catch (e) {
            console.error(`Error migrando cliente ${c.id}: ${e.message}`);
        }
    }
    console.log(`Se migraron/actualizaron ${pbClientes.length} clientes.`);


    // 3. MIGRACION DE ORDENES -> ORDERS
    // console.log('\n--- 3. Migrando Órdenes ---');
    // const pbOrdenes = await fetchAllRecords('ordenes', token);
    // for (const o of pbOrdenes) {
    //     // Buscar id_cliente mapeado. En v1 `nit_cliente` o `id_cliente` se guardaba? api.ts no aclara exacto si guarda PB id o el String nit. 
    //     // Buscaremos primero si hay conincidencia en PB ID o por ID en prisma directo.
    //     let customerId = cache.customers[o.cliente_id || o.nit_cliente];
    //     if (!customerId) {
    //         // Intenta buscar el cliente en prisma si se mapeó por nit
    //         const exist = await prisma.customer.findFirst({ where: { tenantId: CONFIG.TARGET_TENANT_ID, identification: o.nit_cliente } });
    //         if (exist) customerId = exist.id;
    //     }

    //     if (!customerId) {
    //         console.warn(`Alerta: No se encontró cliente para la orden ${o.n_orden}. Se creará Cliente Default.`);
    //         const defC = await prisma.customer.upsert({
    //             where: { tenantId_identification: { tenantId: CONFIG.TARGET_TENANT_ID, identification: 'DEFAULT' } },
    //             update: {},
    //             create: { tenantId: CONFIG.TARGET_TENANT_ID, identification: 'DEFAULT', name: 'Cliente Por Defecto' }
    //         });
    //         customerId = defC.id;
    //     }

    //     // Status Map (OrderStatus) -> ACTIVE, COMPLETED, CANCELLED
    //     let status = 'ACTIVE';
    //     if (o.estado === 'ANULADA') status = 'CANCELLED';
    //     else if (o.estado === 'ENTREGADA') status = 'COMPLETED'; // Ajustar según estados reales

    //     try {
    //         const order = await prisma.order.upsert({
    //             where: { tenantId_number: { tenantId: CONFIG.TARGET_TENANT_ID, number: Number(o.n_orden) } },
    //             update: {},
    //             create: {
    //                 tenantId: CONFIG.TARGET_TENANT_ID,
    //                 number: Number(o.n_orden),
    //                 customerId,
    //                 orderDate: o.fecha_creacion ? new Date(o.fecha_creacion) : new Date(o.created),
    //                 dueDate: o.fecha_entrega ? new Date(o.fecha_entrega) : null,
    //                 total: o.monto || 0,
    //                 subtotal: o.monto || 0, // asumiendo 0 iva/discount por ahora
    //                 balance: o.saldo || 0,
    //                 status: status,
    //                 operationalStatus: o.aprobado_impresion ? 'APPROVED' : 'PENDING',
    //                 sellerId: o.id_vendedor || CONFIG.DEFAULT_SELLER_ID,
    //                 sellerName: CONFIG.DEFAULT_SELLER_NAME,
    //                 notes: o.motivoAnulacion || null,
    //                 createdAt: new Date(o.created),
    //                 updatedAt: new Date(o.updated)
    //             }
    //         });
    //         cache.orders[o.id] = order.id;
    //     } catch (e) {
    //         console.error(`Error migrando orden ${o.n_orden}: ${e.message}`);
    //     }
    // }
    // console.log(`Se migraron ${pbOrdenes.length} órdenes.`);


    // 4. MIGRACION DE ITEMS DE ORDENES -> ORDER ITEMS
    // console.log('\n--- 4. Migrando Items de Órdenes ---');
    // try {
    //     const pbItems = await fetchAllRecords('ordenes_items', token);
    //     let itemsMigrated = 0;

    //     for (const o of pbOrdenes) {
    //         if (!o.items || !Array.isArray(o.items)) continue;

    //         const parentOrderId = cache.orders[o.id];
    //         if (!parentOrderId) continue;

    //         for (const itemId of o.items) {
    //             const item = pbItems.find(i => i.id === itemId);
    //             if (item) {
    //                 try {
    //                     const existItem = await prisma.orderItem.findFirst({
    //                         where: {
    //                             tenantId: CONFIG.TARGET_TENANT_ID,
    //                             orderId: parentOrderId,
    //                             description: item.descripcion || 'Item migrado',
    //                             quantity: item.cantidad || 1,
    //                             unitPrice: item.precio_unitario || 0
    //                         }
    //                     });

    //                     if (!existItem) {
    //                         await prisma.orderItem.create({
    //                             data: {
    //                                 tenantId: CONFIG.TARGET_TENANT_ID,
    //                                 orderId: parentOrderId,
    //                                 description: item.descripcion || 'Item migrado',
    //                                 quantity: item.cantidad || 1,
    //                                 unitPrice: item.precio_unitario || 0,
    //                                 lineTotal: (item.cantidad || 1) * (item.precio_unitario || 0),
    //                                 createdAt: new Date(item.created)
    //                             }
    //                         });
    //                         itemsMigrated++;
    //                     }
    //                 } catch (e) {
    //                     console.error(`Error item de orden: ${e.message}`);
    //                 }
    //             }
    //         }
    //     }
    //     console.log(`Se migraron ${itemsMigrated} items de órdenes en total.`);
    // } catch (e) {
    //     console.log('Error migrando ordenes_items.', e.message);
    // }

    // 4.5 MIGRACION DE PAGOS (ABONOS) -> PAYMENTS
    // console.log('\n--- 4.5 Migrando Pagos (Abonos) de Órdenes ---');
    // let paymentsMigrated = 0;
    // for (const o of pbOrdenes) {
    //     if (!o.abonos || !o.abonos.list || !Array.isArray(o.abonos.list)) continue;

    //     const parentOrderId = cache.orders[o.id];
    //     if (!parentOrderId) continue;

    //     for (const abono of o.abonos.list) {
    //         let paymentMethodStr = (abono.medio || 'efectivo').toLowerCase();
    //         let paymentMethodId = cache.paymentMethods[paymentMethodStr];
    //         if (!paymentMethodId) {
    //             const existPM = await prisma.paymentMethod.findUnique({
    //                 where: { tenantId_name: { tenantId: CONFIG.TARGET_TENANT_ID, name: paymentMethodStr.toUpperCase() } }
    //             });
    //             if (existPM) {
    //                 paymentMethodId = existPM.id;
    //                 cache.paymentMethods[paymentMethodStr] = existPM.id;
    //             } else {
    //                 const pm = await prisma.paymentMethod.create({
    //                     data: { tenantId: CONFIG.TARGET_TENANT_ID, name: paymentMethodStr.toUpperCase() }
    //                 });
    //                 paymentMethodId = pm.id;
    //                 cache.paymentMethods[paymentMethodStr] = pm.id;
    //             }
    //         }

    //         try {
    //             // To avoid duplicate payments when script is rerun, check if exact same payment exists for this order
    //             const existPayment = await prisma.payment.findFirst({
    //                 where: {
    //                     tenantId: CONFIG.TARGET_TENANT_ID,
    //                     orderId: parentOrderId,
    //                     paymentMethodId: paymentMethodId,
    //                     amount: abono.valor || 0,
    //                 }
    //             });

    //             if (!existPayment) {
    //                 await prisma.payment.create({
    //                     data: {
    //                         tenantId: CONFIG.TARGET_TENANT_ID,
    //                         orderId: parentOrderId,
    //                         paymentMethodId: paymentMethodId,
    //                         amount: abono.valor || 0,
    //                         paymentDate: abono.fecha ? new Date(abono.fecha) : new Date(o.created),
    //                         registeredBy: CONFIG.DEFAULT_SELLER_NAME,
    //                         createdAt: new Date(o.created)
    //                     }
    //                 });
    //                 paymentsMigrated++;
    //             }
    //         } catch (e) {
    //             console.error(`Error migrando pago de orden ${o.n_orden}: ${e.message}`);
    //         }
    //     }
    // }
    // console.log(`Se migraron ${paymentsMigrated} pagos de órdenes.`);

    // 5. MIGRACIÓN DE EGRESOS -> EXPENSES
    // console.log('\n--- 5. Migrando Egresos ---');
    // const pbEgresos = await fetchAllRecords('egresos', token);
    // for (const e of pbEgresos) {
    //     // 5.1 Proveedor
    //     let supplierName = e.proveedor || 'Proveedor General';
    //     let supplierId = cache.suppliers[supplierName];
    //     if (!supplierId) {
    //         const sup = await prisma.supplier.upsert({
    //             where: { tenantId_name: { tenantId: CONFIG.TARGET_TENANT_ID, name: supplierName } },
    //             update: {},
    //             create: { tenantId: CONFIG.TARGET_TENANT_ID, name: supplierName }
    //         });
    //         supplierId = sup.id;
    //         cache.suppliers[supplierName] = supplierId;
    //     }

    //     // 5.2 Categoria
    //     let catName = e.categoria || 'G_OFICINA'; // basado en FiltroCategorias {m_prima, inversion, g_oficina}
    //     let categoryId = cache.categories[catName];
    //     if (!categoryId) {
    //         const cat = await prisma.category.upsert({
    //             where: { tenantId_name: { tenantId: CONFIG.TARGET_TENANT_ID, name: catName.toUpperCase() } },
    //             update: {},
    //             create: { tenantId: CONFIG.TARGET_TENANT_ID, name: catName.toUpperCase(), type: 'EXPENSE' }
    //         });
    //         categoryId = cat.id;
    //         cache.categories[catName] = categoryId;
    //     }

    //     // 5.3 Medio de pago fallback
    //     let paymentMethodStr = (e.medio_pago || 'efectivo').toLowerCase();
    //     let paymentMethodId = cache.paymentMethods[paymentMethodStr];
    //     if (!paymentMethodId) {
    //         // Buscar si ya existe en base de datos
    //         const existPM = await prisma.paymentMethod.findUnique({
    //             where: { tenantId_name: { tenantId: CONFIG.TARGET_TENANT_ID, name: paymentMethodStr.toUpperCase() } }
    //         });
    //         if (existPM) {
    //             paymentMethodId = existPM.id;
    //             cache.paymentMethods[paymentMethodStr] = existPM.id;
    //         } else {
    //             const pm = await prisma.paymentMethod.create({
    //                 data: { tenantId: CONFIG.TARGET_TENANT_ID, name: paymentMethodStr.toUpperCase() }
    //             });
    //             paymentMethodId = pm.id;
    //             cache.paymentMethods[paymentMethodStr] = pm.id;
    //         }
    //     }

    //     // Insert Egreso (usamos número si existe, o auto generado)
    //     try {
    //         if (!e.n_egreso) continue; // safety
    //         await prisma.expense.upsert({
    //             where: { tenantId_number: { tenantId: CONFIG.TARGET_TENANT_ID, number: Number(e.n_egreso) } },
    //             update: {},
    //             create: {
    //                 tenantId: CONFIG.TARGET_TENANT_ID,
    //                 number: Number(e.n_egreso),
    //                 expenseDate: e.fecha ? new Date(e.fecha) : new Date(e.created),
    //                 description: e.concepto || 'Egreso Migrado',
    //                 amount: e.valor || 0,
    //                 invoiceNumber: e.n_factura || null,
    //                 supplierId,
    //                 categoryId,
    //                 paymentMethodId,
    //                 registeredBy: e.author || CONFIG.DEFAULT_SELLER_NAME,
    //                 createdAt: new Date(e.created),
    //                 updatedAt: new Date(e.updated)
    //             }
    //         });
    //     } catch (err) {
    //         console.error(`Error migrando egreso ${e.n_egreso}: ${err.message}`);
    //     }
    // }
    // console.log(`Se migraron ${pbEgresos.length} egresos.`);

    console.log('\n=======================================');
    console.log('MIGRACIÓN FINALIZADA SIN ERRORES CRÍTICOS');
    console.log('=======================================');

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error("Fatal Error:", e);
    await prisma.$disconnect();
    process.exit(1);
});
