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
| `features/accounting/statement.ts` | Lectura del extracto en el navegador: `.xlsx` (zip con `DecompressionStream`) y PDF (`pdfjs-dist`, cargado solo al subir un PDF) |
| `ReconciliationTab.tsx` | Pestaña «Conciliación» (superadministración): subir el extracto, saldos, sugerencias y elegir a mano |

Reutiliza MonthNav, Tabs, Card, Dialog, ConfirmDialog, Select, TextField, DateField, Switch, ToggleButton, Badge, Alert y useToast. Única dependencia nueva: `pdfjs-dist`, para leer el extracto en PDF.
