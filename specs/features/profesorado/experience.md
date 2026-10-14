# Experience — Profesorado

- Solo administración. Al consultar un mes (hasta el actual) el servidor propone sus sesiones la primera vez.
- **Rentabilidad:** orden por margen por defecto; el primero por margen lleva «Más rentable». € por hora = «—» sin horas. Ocupación = ocupadas/plazas en %.
- **Registro de horas:** filtrar por profesor recarga la lista. «Quitar» pide confirmación (ConfirmDialog). Editar y quitar no se muestran en sesiones de liquidaciones pagadas («Pagada» con candado).
  Errores del servidor (`settlement_paid`, validación de horas) en `Alert` dentro del diálogo. Toasts: «Horas registradas», «Sesión actualizada», «Sesión quitada», «Festivo marcado: N sesiones quitadas».
- **Liquidación:** «Marcar como pagada» usa la fecha de hoy y muestra el toast «Liquidación de <profesor> pagada»; «Marcar todas como pagadas» pide confirmación y muestra «N liquidaciones pagadas».
  El detalle se despliega con el botón de chevron (`aria-expanded`). Imprimir abre la hoja y llama a `window.print()` desde su botón.
  El lápiz de una liquidación pagada solo lo ve superadministración; abre «Fecha de pago» y, con una fecha distinta, pide confirmación con «Fecha de pago: antes → después» antes de guardar (sin cambio, cierra sin más). Toast «Fecha de pago cambiada». El mismo diálogo, con la misma confirmación, se usa desde «Pagos recibidos» en la ficha del profesor.
- Estados vacíos: «No hay sesiones registradas este mes.», «No hay liquidaciones este mes.», «No hay datos de rentabilidad este mes.»; julio y agosto: «En julio y agosto no hay clases.»
- Importes con `formatCents`; horas con coma decimal («1,5 h»).
