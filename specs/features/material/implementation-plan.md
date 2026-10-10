# Implementation plan — Material deportivo

- `features/equipment/api.ts` y `hooks.ts`: productos, pedidos (con filtro), compras, stock y margen
  (`/api/admin/equipment`). `labels.ts`: estados del pedido y cómo se describe lo pedido.
- `pages/panel/billing/material/MaterialTab.tsx`: elige la vista (`?vista=`), muestra la acción de cada vista y es dueño
  del diálogo abierto (`MaterialDialog`). «Cobrar» no abre un diálogo propio: pide a `BillingPage` el de «Registrar
  cobro» con `kind: 'material'` y el `chargeId` del pedido. `MaterialDialogs` se reutiliza en la ficha del alumno.
- Vistas: `OrdersView` (filtros en estado local, acciones rápidas —deshacer entrega, reactivar— en línea),
  `StockView`, `MarginsView`, `ProductsView`.
- Diálogos sobre `FormDialog` (título, error de validación o de la API, Cancelar/confirmar): `OrderDialog`,
  `OrderActionDialogs` (precio, entrega, cancelación), `ProductDialog`, `PurchaseDialog` (una casilla por variante:
  combinaciones de las opciones de los campos de lista).
- Tras cada cambio, `useRefreshClubData` refresca todo (el material toca cuotas, fichas y contabilidad).
- Cobros: `usePaymentForm` añade el concepto «Material» (solo con pedidos pendientes en `account.materialCharges`) y el
  pedido elegido; `ChargesTab` muestra el concepto propio de las cuotas de material y no ofrece cancelarlas.
- Ficha: `StudentMaterialCard` (pedidos del alumno) y `ClubTotals` en `StudentBillingCard` (`account.totals`).
