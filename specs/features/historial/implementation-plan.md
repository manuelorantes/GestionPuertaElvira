# Implementation plan — Historial (web)

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `features/audit/api.ts` | Tipos y llamadas a `/api/admin/audit/actions` (`fetchActions(query, before)`, `fetchPayments(period, before)`, detalle, deshacer, volver) |
| `features/audit/sections.ts` | Pestañas (`TABS`, `tabFrom`), periodos (`PERIODS`, `periodFrom`, `periodId`, `periodPhrase`) y mensajes de vacío |
| `features/audit/fields.ts` | Etiquetas y valores legibles del detalle; `paymentMethodLabel` |
| `features/audit/targets.ts` | Enlaces a donde se ve cada registro |
| `pages/panel/audit/AuditPage.tsx` | Guardia de rol, pestañas, filtros (persona o periodo) y qué sección se muestra; estado en la URL |
| `pages/panel/audit/ActionsHistory.tsx` | Lista paginada de acciones con detalle desplegable; recibe la consulta y el mensaje de vacío |
| `pages/panel/audit/ActionDetail.tsx` | Detalle campo a campo de una acción (`useQuery` por identificador) |
| `pages/panel/audit/useRevert.tsx` | Estado, mutación y diálogo de deshacer / volver aquí |
| `pages/panel/audit/RevertButtons.tsx` | «Deshacer» y «Volver aquí» de una acción |
| `pages/panel/audit/ClassesHistory.tsx` | Una fila por clase; al abrirla, `ClassDay` con `GroupAttendanceTable` (de Clases, `highlight` del día), las notas y la lista corta de acciones |
| `pages/panel/audit/PaymentsHistory.tsx` | Lista paginada de cobros con la suma del periodo |
| `pages/panel/audit/PeriodFilter.tsx` | Chips Hoy · Esta semana · Este mes · Todo |

## Estado

- La URL manda: `seccion`, `periodo` y `persona`. Nada de esto se copia a estado local.
- `ActionsHistory` y `PaymentsHistory` usan `useInfiniteQuery` con la consulta en la clave; el detalle de una
  acción, `useQuery` por identificador.
- La lista de personas del Select la da la propia respuesta de la general (`onPeople`).
- Los diálogos de confirmación los da `useRevert`, usado por `ActionsHistory` y por cada `ClassDay`.

## Reutilización

`Tabs`, `Card`, `SectionHeader`, `Select`, `ToggleButton` (tono `ink`, como los chips de Contabilidad), `Badge`,
`Button`, `Alert`, `ConfirmDialog`, `useToast`, `useTableSort`, `madridDateTime`, `formatCents`.
