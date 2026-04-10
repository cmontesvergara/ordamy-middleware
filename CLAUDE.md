# CLAUDE.md — Agente de Desarrollo

## 🧠 Memory Bank

Este proyecto usa un sistema de Memory Bank centralizado. El conocimiento del negocio,
arquitectura y contexto activo vive en un repo separado:

```
../memory-bank/          ← repo hermano, clonado al mismo nivel que este repo
```

Si no existe ese directorio, detenerse y avisar:
"⚠️ Memory Bank no encontrado. Clonar el repo memory-bank al mismo nivel que este repo antes de continuar."

---

## 📥 PASO 1 — Leer al iniciar CUALQUIER tarea

Leer estos archivos en este orden exacto. No saltar ninguno.

### Siempre obligatorios:
1. `../memory-bank/product-context.md`
   → Visión del producto, lógica de negocio core, usuarios, métricas clave.
   → Si no entiendes para qué sirve una feature, la respuesta está aquí.

2. `../memory-bank/architecture.md`
   → Stack completo, relaciones entre repos/servicios, contratos de APIs,
     convenciones de carpetas, variables de entorno críticas.
   → Antes de crear cualquier archivo o servicio, confirmar que encaja aquí.

3. `../memory-bank/active-context.md`
   → Estado actual del proyecto: qué se está haciendo, últimas decisiones,
     qué quedó pendiente en la sesión anterior.
   → Este archivo es el "dónde estábamos". Leerlo antes de hacer cualquier cosa.

### Condicionales — leer SOLO si la tarea lo requiere:

| Si la tarea involucra...         | Leer también...                          |
|----------------------------------|------------------------------------------|
| UI, componentes, estilos         | `../memory-bank/design-system.md`        |
| Una feature nueva                | `../memory-bank/progress.md`             |
| Algo que se rompió antes         | `../memory-bank/patterns-gotchas.md`     |
| Revisión de código / PR          | `../memory-bank/patterns-gotchas.md`     |
| Documentación técnica            | `../memory-bank/architecture.md` (ya cargado) |

Después de leer, confirmar con una línea:
"✅ Memory Bank cargado. Contexto activo: [resumir en 1 oración qué está en curso según active-context.md]"

---

## ⚙️ PASO 2 — Comportamiento por tipo de tarea

### Feature nueva (frontend o backend)
- Verificar en `progress.md` que la feature no existe ni está en curso.
- Verificar en `architecture.md` que el approach encaja con el stack y los contratos existentes.
- Si la feature toca UI: respetar tokens y patrones de `design-system.md` sin excepción.
- Al terminar: actualizar `progress.md` y `active-context.md`.

### Bug o refactor
- Antes de tocar código, buscar en `patterns-gotchas.md` si este bug o patrón
  ya fue documentado. Si existe, seguir la solución probada.
- Si el bug revela algo nuevo sobre el sistema, documentarlo al terminar.
- Al terminar: actualizar `active-context.md` y `patterns-gotchas.md` si aplica.

### Documentación
- Toda documentación técnica debe ser consistente con `architecture.md`.
- No documentar comportamientos que contradigan lo que está en el Memory Bank
  sin actualizar el Memory Bank primero.
- Al terminar: si la documentación cambió algo sobre el sistema,
  actualizar `architecture.md`.

### Revisión de código / PR
- Evaluar el PR contra: convenciones de `architecture.md`,
  patrones de `design-system.md` (si hay UI), y gotchas de `patterns-gotchas.md`.
- Reportar inconsistencias con el Memory Bank como observaciones prioritarias.
- No aprobar código que contradiga decisiones documentadas sin justificación explícita.

---

## 📤 PASO 3 — Actualizar el Memory Bank al terminar

Obligatorio al final de CADA sesión. No es opcional.

### `active-context.md` — SIEMPRE actualizar
Reemplazar la sección `## Estado actual` con este formato exacto:

```markdown
## Estado actual
**Última actualización:** YYYY-MM-DD
**Repo activo:** [nombre de este repo]
**Tarea completada:** [descripción en 1-2 líneas de qué se hizo]
**Decisiones tomadas:** [lista de decisiones importantes, o "ninguna" si no hubo]
**Pendiente / próximos pasos:** [qué sigue, para que la próxima sesión arranque aquí]
**Bloqueantes:** [si hay algo bloqueado, describirlo; si no, "ninguno"]
```

### `progress.md` — Actualizar si:
- Se completó una feature → moverla a `## Completado` con fecha.
- Se inició una feature → agregarla a `## En curso` con descripción breve.
- Se descartó algo → moverla a `## Descartado` con motivo.
- No inventar ni borrar entradas existentes. Solo agregar o mover.

### `patterns-gotchas.md` — Actualizar si:
- Se descubrió un patrón nuevo que el equipo debería seguir.
- Se encontró un error recurrente o una trampa no documentada.
- Se tomó una decisión de arquitectura local que puede repetirse en otros repos.

Formato para nueva entrada:
```markdown
### [Título corto del patrón o gotcha]
**Repo afectado:** [este repo u "todos"]
**Contexto:** [cuándo aparece este patrón]
**Solución / convención:** [qué hacer]
**Descubierto:** YYYY-MM-DD
```

### `architecture.md` — Actualizar SOLO si:
- Se agregó un nuevo servicio, endpoint o integración.
- Cambió una convención de carpetas o naming.
- Se modificó un contrato entre servicios.
- ⚠️ Este archivo es sensible. Cambios aquí afectan todos los repos y agentes.
  Describir el cambio con precisión quirúrgica.

### `design-system.md` — Actualizar SOLO si:
- Se creó un componente nuevo que otros repos deberían reusar.
- Se estableció un nuevo patrón de UX.
- ⚠️ No documentar variaciones ad-hoc. Solo patrones que el equipo adopta oficialmente.

---

## 🚫 Reglas que nunca se rompen

1. **Nunca modificar `product-context.md` desde un agente.**
   Este archivo lo edita el equipo humano. Si algo en él está desactualizado, avisar.

2. **Nunca asumir contexto que no está en el Memory Bank.**
   Si algo no está documentado y es relevante, preguntar o documentarlo al terminar.

3. **Nunca sobreescribir entradas existentes en `progress.md` o `patterns-gotchas.md`.**
   Solo agregar. El historial importa.

4. **Si hay conflicto entre el Memory Bank y el código real, reportarlo.**
   No resolver en silencio. Decir: "⚠️ Inconsistencia detectada entre [archivo] y el código.
   Recomiendo actualizar [archivo] con: [descripción del cambio]."

5. **Si no leíste el Memory Bank, no escribas código.**
   Sin contexto, cualquier decisión puede romper otro repo sin saberlo.

---

## 📁 Estructura esperada del Memory Bank

```
../memory-bank/
├── product-context.md      ← visión, negocio, usuarios (solo humanos editan)
├── architecture.md         ← stack, servicios, contratos, convenciones
├── design-system.md        ← tokens, componentes, patrones de UX
├── active-context.md       ← estado actual, tarea en curso, próximos pasos
├── progress.md             ← features: en curso / completadas / descartadas
└── patterns-gotchas.md     ← convenciones, errores frecuentes, lecciones
```

---

## 🔁 Resumen del flujo por sesión

```
Iniciar sesión
    ↓
Leer Memory Bank (obligatorios + condicionales)
    ↓
Confirmar contexto activo en 1 línea
    ↓
Ejecutar la tarea
    ↓
Actualizar active-context.md (siempre)
Actualizar otros archivos según lo que ocurrió
    ↓
Reportar qué se actualizó y por qué
```
