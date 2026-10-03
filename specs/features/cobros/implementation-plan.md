# Implementation plan — Cobros y cuotas (web)

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `features/billing/api.ts` | Tipos y llamadas a `/api/admin/billing/*` |
| `features/billing/hooks.ts` | `useMonthlyCharges(month)`, `usePayments(studentId?)`, `usePayment(id)`, `useAccount(id)`, `useBillingSettings()`, `useBillingMutation()` (invalida `charges`, `payments`, `payment`, `account`) |
| `features/billing/money.ts` | `formatCents`, `centsLabel`, `monthLabel(AAAA-MM)`, `shiftMonth`, `whatsappLink`, `reminderText` |
| `features/billing/usePaymentForm.ts` | Estado del diálogo de cobro, cotización con debounce (`useDebouncedValue`) y guardado |
| `pages/panel/billing/BillingPage.tsx` | Cabecera, pestañas y diálogos abiertos (estado `dialog` discriminado) |
| `pages/panel/billing/ChargesTab.tsx` | Navegación de mes, progreso y tabla o tarjetas |
| `pages/panel/billing/PaymentsTab.tsx` | Lista de cobros |
| `pages/panel/billing/SettingsTab.tsx` | Formulario de ajustes (estado local de strings) |
| `pages/panel/billing/PaymentDialog.tsx` | Formulario de cobro (usa `usePaymentForm`) |
| `pages/panel/billing/ReceiptDialog.tsx` | Hoja imprimible y acción de factura |
| `pages/panel/billing/InvoiceDialog.tsx` | Datos del cliente |
| `pages/panel/billing/WhatsAppDialog.tsx` | Mensaje y enlace |
| `pages/panel/students/StudentBillingCard.tsx` | Tarjeta de la ficha |

## Estado

- El estado de la URL vive en la página: pestaña y mes.
- La página guarda `dialog: { kind: 'payment', studentId?, kind? } | { kind: 'receipt', id } | { kind: 'whatsapp', charge } | null`.
  Al guardar un cobro, la página pasa al recibo.
- Los datos del servidor se gestionan solo con TanStack Query; no se copian a estado local, salvo en los formularios.

## Reutilización

`Dialog`, `Button`, `Tabs`, `Badge`, `Avatar`, `Card`, `Select`, `TextField`, `Switch`, `ToggleButton`, `DateField`, `Alert`, `SectionHeader`, `useToast` y `useDebouncedValue`.
No se añaden dependencias nuevas.
