# Implementation plan — Contabilidad (web)

| Archivo | Responsabilidad |
|---|---|
| `shared/api/client.ts` | `apiUpload` (multipart + `X-Requested-With: fetch`) |
| `features/accounting/api.ts` · `hooks.ts` · `categories.ts` | Tipos, llamadas, queries (`ledger`, `invoices`, `fiscal-year`), `useAccountingMutation`, categorías por tipo |
| `pages/panel/accounting/AccountingPage.tsx` | Cabecera, pestañas, diálogo de factura |
| `LedgerTab.tsx` · `InvoicesTab.tsx` · `YearTab.tsx` | Pestañas |
| `EntryDialog.tsx` · `InvoiceDialog.tsx` · `PayInvoiceDialog.tsx` | Diálogos |

Reutiliza MonthNav, Tabs, Card, Dialog, ConfirmDialog, Select, TextField, DateField, Switch, ToggleButton, Badge, Alert y useToast. Sin dependencias nuevas.
