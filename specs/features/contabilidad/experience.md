# Experience — Contabilidad

- Solo administración. Movimientos del mes actual por defecto; temporada actual (sep–ago) en el cierre.
- Los movimientos automáticos (cuotas, liquidaciones, facturas) no se editan aquí; solo los apuntes manuales se quitan (con confirmación).
- «Añadir factura»: el documento se valida en el navegador (tipo y 10 MB) y en el servidor; si «Ya está pagada», se registra el pago con la misma fecha.
  Toast «Factura registrada». Errores del servidor en `Alert` dentro del diálogo.
- El documento se abre en una pestaña nueva (`/api/admin/accounting/invoices/{id}/attachment`).
- «Cerrar temporada» pide confirmación: «Los movimientos de septiembre <año> a agosto <año+1> quedarán bloqueados y el resultado pasará como saldo inicial de <siguiente>». Errores (`season_not_finished`, `previous_season_open`) en `Alert`.
- Cualquier operación sobre una fecha de temporada cerrada muestra el mensaje `period_closed` del servidor.
- Estados vacíos: «No hay movimientos este mes.», «Todavía no hay facturas.».
