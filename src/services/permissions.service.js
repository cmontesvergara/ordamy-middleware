import { SSO_BACKEND_URL, APP_ID } from "../config/env.js";

/**
 * TODO: OPTIMIZACIÓN CRÍTICA - CACHE DE PERMISOS
 * 
 * PROBLEMA: Cada request que pasa por authMiddleware hace una llamada HTTP
 * al SSO para obtener permisos. En escenarios de alta carga, esto genera:
 * - Latencia adicional (~100-300ms por request)
 * - Carga innecesaria en el servicio SSO
 * - Posible degradación cuando el SSO está lento
 * 
 * IMPACTO ACTUAL:
 * - Con ~100 requests/minuto = ~100 llamadas HTTP al SSO solo para permisos
 * - Cada llamada añade 100-300ms de latencia
 * - Usuarios con el mismo rol consultan repetidamente
 * 
 * SOLUCIÓN PROPUESTA: Implementar cache de permisos por role
 * 
 * OPCIÓN 1 - Cache en memoria (Node.js):
 * --------------------------------------
 * const permissionsCache = new Map();
 * // Key: `${roleName}:${APP_ID}`
 * // Value: { permissions: [], timestamp: Date }
 * // TTL: 5 minutos
 * 
 * Implementación:
 * async function fetchPermissionsFromSSO(accessToken, roleName) {
 *     const cacheKey = `${roleName}:${APP_ID}`;
 *     const cached = permissionsCache.get(cacheKey);
 *     
 *     if (cached && (Date.now() - cached.timestamp) < 5 * 60 * 1000) {
 *         return cached.permissions;
 *     }
 *     
 *     const permissions = await fetchFromSSO(...);
 *     permissionsCache.set(cacheKey, { permissions, timestamp: Date.now() });
 *     return permissions;
 * }
 * 
 * OPCIÓN 2 - Cache distribuido (Redis):
 * -------------------------------------
 * // Si Ordamy escala a múltiples instancias, Redis permite
 * // compartir cache entre nodos
 * 
 * Implementación:
 * const redis = new Redis(process.env.REDIS_URL);
 * 
 * async function fetchPermissionsFromSSO(accessToken, roleName) {
 *     const cacheKey = `permissions:${roleName}:${APP_ID}`;
 *     const cached = await redis.get(cacheKey);
 *     
 *     if (cached) {
 *         return JSON.parse(cached);
 *     }
 *     
 *     const permissions = await fetchFromSSO(...);
 *     await redis.setex(cacheKey, 300, JSON.stringify(permissions)); // 5 min TTL
 *     return permissions;
 * }
 * 
 * OPCIÓN 3 - Cache en JWT (preferido a largo plazo):
 * -------------------------------------------------
 * // Incluir permissions en el token JWT durante el login/exchange
 * // Elimina completamente la necesidad de llamar al SSO
 * // Requiere cambio en el SDK de SSO (@bigso/auth-sdk)
 * 
 * IMPACTO ESPERADO:
 * - Reducción de latencia: ~200ms por request
 * - Reducción de carga SSO: ~90% de requests (solo el primer request
 *   de cada rol necesitaría consultar al SSO)
 * 
 * CONSIDERACIONES:
 * - Cache TTL debe balancear frescura vs performance
 * - Si se implementa cache, considerar endpoint de invalidación manual
 *   para cuando un admin cambia permisos de un rol
 * - En entornos multi-instancia, cache en memoria no funciona (cada
 *   instancia tendría su propio cache)
 * 
 * PRIORIDAD: ALTA
 * ESTIMACIÓN: 4-8 horas de trabajo (Opción 1)
 *              8-16 horas de trabajo (Opción 2 con Redis)
 * 
 * NOTA: Actualmente sin cache, cada request autenticada genera:
 * 1. Validar JWT (local)
 * 2. Consultar permisos (HTTP al SSO) <- OPTIMIZAR ESTO
 * 3. Sync tenant (DB local)
 * 
 * La consulta #2 es el cuello de botella.
 */

/**
 * Fetches permissions from SSO Core for a given role
 * @param {string} accessToken - The JWT access token
 * @param {string} roleName - The role name to fetch permissions for
 * @returns {Promise<Array>} Array of permissions
 */
export async function fetchPermissionsFromSSO(accessToken, roleName) {
    try {
        const url = `${SSO_BACKEND_URL}/api/v2/role/${encodeURIComponent(roleName)}/permission?appId=${APP_ID}`;
        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        
        if (!response.ok) {
            console.error(`[Ordamy] SSO Core returned ${response.status} for role ${roleName}`);
            return [];
        }
        
        const data = await response.json();
        const allPerms = data.permissions || [];
        
        // Filter permissions for this specific app
        return allPerms.filter(p => p.appId === APP_ID);
    } catch (error) {
        console.error("[Ordamy] Failed to fetch permissions from SSO Core:", error.message);
        return [];
    }
}
