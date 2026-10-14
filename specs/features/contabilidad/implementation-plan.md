# Implementation plan — Contabilidad (web)

| Archivo | Responsabilidad |
|---|---|
| `shared/api/client.ts` | `apiUpload` (multipart + `X-Requested-With: fetch`) |
| `features/accounting/api.ts` · `hooks.ts` · `categories.ts` | Tipos, llamadas, queries (`ledger`, `invoices`, `fiscal-year`), `useAccountingMutation`, categorías por tipo |
| `pages/panel/accounting/AccountingPage.tsx` | Cabecera, pestañas, diálogo de factura |
| `pages/panel/accounting/EditInvoiceDialog.tsx` | «Editar factura» (superadministración): formulario y confirmación de cambios |
| `shared/ui/ConfirmChangesDialog.tsx` · `shared/ui/fieldChanges.ts` | Confirmación «¿Guardar estos cambios?» con la lista de lo que cambia, compartida por movimientos, facturas y liquidaciones |
| `LedgerTab.tsx` · `InvoicesTab.tsx` · `YearTab.tsx` | Pestañas |
| `EntryDialog.tsx` · `InvoiceDialog.tsx` · `PayInvoiceDialog.tsx` | Diálogos |

Reutiliza MonthNav, Tabs, Card, Dialog, ConfirmDialog, Select, TextField, DateField, Switch, ToggleButton, Badge, Alert y useToast. Sin dependencias nuevas.
