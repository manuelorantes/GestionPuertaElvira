# Implementation plan — Profesorado (web)

| Archivo | Responsabilidad |
|---|---|
| `features/payroll/api.ts` · `hooks.ts` | Tipos, llamadas y queries (`sessions`, `settlements`, `profitability`) + `usePayrollMutation` |
| `features/payroll/hours.ts` | `hoursLabel(minutes)` |
| `shared/ui/MonthNav.tsx` | Navegación de mes reutilizada por Cobros y Profesorado (extraída de `ChargesTab`) |
| `pages/panel/payroll/TeachersPayPage.tsx` | Cabecera, mes, pestañas y diálogos |
| `pages/panel/payroll/ProfitabilityTab.tsx` · `SessionsTab.tsx` · `SettlementsTab.tsx` | Pestañas |
| `pages/panel/payroll/SessionDialog.tsx` · `HolidayDialog.tsx` · `SettlementSheetDialog.tsx` | Diálogos |

Estado de URL: pestaña, mes y profesor filtrado. Datos de servidor solo en TanStack Query. Sin dependencias nuevas.
