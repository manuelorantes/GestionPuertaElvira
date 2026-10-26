# Layout — Contabilidad

Fuente: sección «Contabilidad» (Movimientos, Facturas, Mes a mes y cierre) y modal «Añadir factura» de `GestionClub.dc.html`.

```
AccountingPage (/panel/contabilidad)
├── SectionHeader: «Temporada 2026/27» | «Contabilidad» | acción «Añadir factura» (icono upload)
├── Tabs: Movimientos · Facturas · Mes a mes y cierre · Ajustes · Diagnóstico (?pestana=movimientos|facturas|cierre|ajustes|diagnostico)
├── LedgerTab: MonthNav (?mes) + botón «Añadir movimiento»
│   ├── Filtros sobre la tabla: chips «Todo | Ingresos | Pagos» (?tipo=ingresos|pagos; activo en negro) y, con Ingresos, debajo, franja «Forma de pago» con subfiltro «Todos | Tarjeta | Transferencia | Efectivo» (?forma=…; chips pequeños, activo verde suave); con filtro, «N movimientos · ±X» bajo la tabla
│   ├── Tabla (2/3): icono entrada/salida (verde/rojo) | Fecha | Concepto (debajo, en gris, «Corresponde a …» si no es solo el mes de su fecha, con el detalle por mes en el título) | Categoría (chip) | Forma de pago | Importe (+/−); apuntes manuales con «Quitar»
│   │   └── pie: «Ingresos X · Gastos Y · Resultado Z»
│   └── Columna (1/3):
│       ├── Tarjeta «Gastos esperados de <mes>» (solo si hay): una fila por gasto esperado (concepto, importe esperado o pagado); pendiente → «Pagar» + «No hay este mes»; pagado → chip verde «Pagado», «el <fecha>» y «· se esperaban X» si no coincide; saltado → chip «No hay este mes» + «Volver a esperarlo»; pie «Falta por pagar X»
│       └── Tarjeta «Gastos de <mes>»: barras por categoría (oscuras, proporcionales) + Total
├── InvoicesTab: tabla Fecha | Nº | Proveedor | Concepto | Categoría | Importe | Estado (Pagada/Pendiente) | documento (clip: ver) | acciones (Pagar, Quitar si pendiente; lápiz «Editar» a la derecha del todo, solo superadministración)
├── YearTab: selector de temporada (‹ 2026/27 ›)
│   ├── Tabla «Temporada 2026/27 mes a mes»: Mes | Ingresos | Gastos | Resultado (verde/rojo) — por los meses a los que corresponde — | Saldo (por fecha); fila de saldo inicial; fila Total (fondo arena)
│   └── Tarjeta oscura «Cierre de temporada 2026/27»: estado (Abierta/Cerrada el …), Ingresos, Gastos, Resultado, «Movido en caja y banco» (si no coincide con el resultado), texto de bloqueo, botón «Cerrar temporada» (solo si se puede) → ConfirmDialog
├── MonthlyCategoriesTab (Ajustes): «Categorías del club» · «Gastos esperados» (botón «Añadir gasto esperado»; tabla ordenable Concepto | Categoría | Importe | Meses («De septiembre a junio», debajo «Desde <mes>») | lápiz «Editar» · papelera «Quitar») · «Categorías del mes»
├── ExpectedExpenseDialog «Añadir/Editar gasto esperado»: Concepto · Categoría (de gasto, sin Profesores) · Importe esperado (€) · chips de los 12 meses de septiembre a agosto («Meses en que se espera», activos en negro) con el resumen debajo
├── PayExpectedDialog «Pagar <concepto>»: lo esperado en el mes · Importe pagado (€) (prellenado) · Forma de pago · Fecha · PeriodSharesField (por defecto, el mes del gasto esperado) · Cancelar | «Pagar»
├── EntryDialog «Añadir movimiento»: Tipo (Ingreso/Gasto) · Fecha · Concepto · Categoría (según tipo) · Forma de pago · Importe (€) · PeriodSharesField
├── PeriodSharesField (apuntes, facturas y sus ediciones): select «Mes al que corresponde» (el de la fecha · meses de 6 antes a 3 después · «Varios meses…»); con varios, recuadro gris con chips de meses «oct 26» (grupo «Meses a los que corresponde», activos en negro), un campo «Octubre 2026 (€)» por mes elegido, y una línea «Repartido a partes iguales.» / «Repartido a mano.» o el error en rojo, con «Repartir a partes iguales» si se tocó a mano
├── InvoiceDialog «Añadir factura»: zona de documento (arrastrar o elegir; PDF o foto, máx. 10 MB) · Proveedor · Nº · Concepto · Fecha · Importe · Categoría · PeriodSharesField · «Ya está pagada» (switch)
├── PayInvoiceDialog «Pagar factura»: Fecha · Forma de pago
└── EditInvoiceDialog «Editar factura» (superadministración): aviso del documento adjunto · Proveedor · Nº · Importe · Concepto · Categoría · Fecha de la factura · PeriodSharesField · (si pagada) Fecha de pago · Forma de pago · Cancelar | «Guardar cambios» → ConfirmChangesDialog «¿Guardar estos cambios?» (lista «Campo: antes → después»; Volver | Confirmar)
```
Responsive: tablas con desplazamiento horizontal; la tarjeta de categorías y la de cierre bajan debajo en móvil.
