# Experience — Cobros y cuotas

## Acceso
Solo administración (ruta dentro de `/panel`). Las peticiones `/api/admin/billing/*` responden 403 a otros roles.

## Flujos

1. **Ver las cuotas del mes.**
   - Al entrar se cargan las del mes actual; el servidor genera las que falten.
   - Con «Mes anterior» y «Mes siguiente» se navega entre meses; el mes va en `?mes=AAAA-MM`.
   - Estados (con `Badge`): Cobrada (success), En plazo (warning), Vencida (danger) y Próxima (neutral).
     Si la cuota se ha avisado, aparece «Avisado» con un check.
2. **Registrar un cobro.**
   - Se abre desde la cabecera (sin alumno), desde una fila (con el alumno y el concepto) o desde la ficha.
   - Al cambiar cualquier campo se pide una cotización, con 250 ms de retardo, y se muestra el desglose.
     Mientras llega se lee «Calculando…».
   - Los errores de la cotización (`beyond_season`, `nothing_to_pay`, `invalid_months`) se muestran como `Alert` dentro del diálogo,
     y «Guardar cobro» queda desactivado.
   - Al guardar se refrescan cuotas, cobros y la ficha, aparece el toast «Cobro registrado · R-2026-0001 · 45 €»
     y se abre el recibo.
3. **Recibo.**
   - «Imprimir» llama a `window.print()`; los estilos de impresión ocultan todo excepto la hoja.
   - «Emitir factura» abre `InvoiceDialog`.
   - Al emitirla, el recibo se recarga con el bloque de factura y aparece el toast «Factura F-… emitida».
   - Si la factura ya existía (`invoice_already_issued`), se muestra el mensaje del servidor.
4. **WhatsApp.**
   - El mensaje se prerrellena: «Hola <nombre del tutor>, te escribimos del Club Ajedrez Puerta Elvira.
     Nos consta pendiente la cuota de <mes> de <nombre del alumno> (<importe>). Puedes pagarla por transferencia
     o en efectivo en el club. ¡Gracias!».
   - «Abrir WhatsApp» abre `https://wa.me/34<teléfono sin espacios>?text=…` en una pestaña nueva,
     marca la cuota como avisada (POST) y cierra el diálogo.
5. **Tarifas y ajustes.**
   - El formulario se carga con los valores actuales.
   - «Guardar ajustes» envía todo; los errores 422 se muestran en un `Alert`; si va bien, aparece el toast «Ajustes guardados».
   - Nota fija: «Los cambios se aplican a las cuotas y cobros nuevos; los ya registrados no cambian.»
6. **Ficha del alumno.**
   - La tarjeta carga la cuenta (`GET accounts/{id}`) y los cobros (`GET payments?studentId=`).
   - «Guardar» envía la preferencia, si es socio y el precio pactado; si va bien, aparece el toast «Datos de cobro guardados».
   - Los botones de puntos ajustan ±1 al momento; «−1» está desactivado con 0 puntos.

## Estados de carga, vacío y error

| Elemento | Carga | Vacío | Error |
|---|---|---|---|
| Cuotas | «Cargando cuotas…» | «No hay cuotas este mes.» (julio y agosto: «En julio y agosto no hay clases.») | Alert de conexión |
| Cobros registrados | «Cargando cobros…» | «Todavía no hay cobros registrados.» | Alert |
| Ajustes | «Cargando ajustes…» | — | Alert |
| Historial de la ficha | — | «Sin cobros todavía.» | — |

## Accesibilidad

- Los diálogos usan el `Dialog` común: foco atrapado, Esc y `aria-labelledby`.
- Los chips de concepto y la forma de pago son botones con `aria-pressed` (`ToggleButton`).
- La navegación de mes tiene `aria-label` en los botones y `aria-live="polite"` en la etiqueta.
- Los importes se formatean con `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })`.
