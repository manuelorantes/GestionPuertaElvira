# Layout — Contabilidad

Fuente: sección «Contabilidad» (Movimientos, Facturas, Mes a mes y cierre) y modal «Añadir factura» de `GestionClub.dc.html`.

```
AccountingPage (/panel/contabilidad)
├── SectionHeader: «Temporada 2026/27» | «Contabilidad» | acción «Añadir factura» (icono upload)
├── Tabs: Movimientos · Facturas · Mes a mes y cierre (?pestana=movimientos|facturas|cierre)
├── LedgerTab: MonthNav (?mes) + botón «Añadir movimiento»
│   ├── Filtros sobre la tabla: chips «Todo | Ingresos | Pagos» (?tipo=ingresos|pagos; activo en negro) y, con Ingresos, debajo, franja «Forma de pago» con subfiltro «Todos | Tarjeta | Transferencia | Efectivo» (?forma=…; chips pequeños, activo verde suave); con filtro, «N movimientos · ±X» bajo la tabla
│   ├── Tabla (2/3): icono entrada/salida (verde/rojo) | Fecha | Concepto | Categoría (chip) | Forma de pago | Importe (+/−); apuntes manuales con «Quitar»
│   │   └── pie: «Ingresos X · Gastos Y · Resultado Z»
│   └── Tarjeta (1/3) «Gastos de <mes>»: barras por categoría (oscuras, proporcionales) + Total
├── InvoicesTab: tabla Fecha | Nº | Proveedor | Concepto | Categoría | Importe | Estado (Pagada/Pendiente) | documento (clip: ver) | acciones (Pagar, Quitar si pendiente)
├── YearTab: selector de temporada (‹ 2026/27 ›)
│   ├── Tabla «Temporada 2026/27 mes a mes»: Mes | Ingresos | Gastos | Resultado (verde/rojo) | Acumulado; fila de saldo inicial; fila Total (fondo arena)
│   └── Tarjeta oscura «Cierre de temporada 2026/27»: estado (Abierta/Cerrada el …), Ingresos, Gastos, Resultado, texto de bloqueo, botón «Cerrar temporada» (solo si se puede) → ConfirmDialog
├── EntryDialog «Añadir movimiento»: Tipo (Ingreso/Gasto) · Fecha · Concepto · Categoría (según tipo) · Forma de pago · Importe (€)
├── InvoiceDialog «Añadir factura»: zona de documento (arrastrar o elegir; PDF o foto, máx. 10 MB) · Proveedor · Nº · Concepto · Fecha · Importe · Categoría · «Ya está pagada» (switch)
└── PayInvoiceDialog «Pagar factura»: Fecha · Forma de pago
```
Responsive: tablas con desplazamiento horizontal; la tarjeta de categorías y la de cierre bajan debajo en móvil.
