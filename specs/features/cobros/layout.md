# Layout — Cobros y cuotas

Fuente: sección «Cobros y cuotas» (pestañas Cuotas, Cobros registrados y Tarifas), modales «Registrar cobro»,
«Recibo» y «Aviso por WhatsApp», y la ficha de alumno de `GestionClub.dc.html`.

Cambios respecto al diseño, por decisiones de la spec:

- Los conceptos «Mes · 3 meses · 6 meses · Todo el año · Cuota de socio» se mantienen. «Todo el año» significa
  «el resto de la temporada».
- Se añade «Descuento especial», que cubre los puntos.
- La factura de un cobro se emite desde el recibo.
- Las tarifas son editables y llevan el botón «Guardar ajustes».

## 1. Component Hierarchy

```
BillingPage (/panel/cobros)
├── SectionHeader: «Plazo: del 1 al 5 de <mes>» | «Cobros y cuotas» | acción «Registrar cobro» (icono wallet) y, debajo, «Añadir dinero a cuenta» (secundaria, icono piggy-bank)
├── Tabs: «Cuotas» · «Material deportivo» · «Cobros registrados» · «Tarifas y ajustes» (?pestana=cuotas|material|registro|tarifas; Material en ../material/layout.md)
├── ChargesTab
│   ├── Botones «Cuotas de socio · Sep · Oct · … · Jun» de la temporada (?mes=socio | ?mes=AAAA-MM; el mes en curso subrayado)
│   ├── Tarjeta de progreso: «N de M cuotas cobradas · X € de Y €» + barra de progreso (brand) + «N vencidas»
│   └── ChargesTable (escritorio: cabecera Alumno | Concepto | Importe | «Estado ▾» | acciones; móvil: tarjetas con «Estado ▾» arriba)
│       ├── Menú «Estado»: Ordenar (Por alumno · Lo pendiente primero · Lo cobrado primero) · Mostrar (casillas de los estados presentes con su número) · «Ver todos»
│       └── Fila: avatar con iniciales + nombre | «Cuota de octubre», «Cuota de socio 2026/27» o el producto del material | importe |
│           badge Cobrada/Pagada en parte (+ «Faltan X»)/En plazo/Vencida (+ «Avisado») | acciones:
│           - pendiente: «Registrar cobro»
│           - vencida: «WhatsApp» (outline, icono message-circle) + «Cobrar»
│           - cobrada: «Recibo» (icono printer, abre el recibo)
├── PaymentsTab
│   └── PaymentsTable: Fecha | Recibo | Alumno | Concepto | Forma de pago (icono banknote o landmark; Badge «Conciliado» o «Sin conciliar» si es tarjeta o transferencia) | Importe | botón «Ver recibo» (printer)
│       └── badge «Factura F-2026-0001» si la tiene
├── SettingsTab (formulario en tres tarjetas, con «Guardar ajustes» al pie)
│   ├── Tarjeta «Cuotas de clases»: 3 h o más · 2 h · 1 h y media · 1 h (€ al mes) · Cuota de socio (€ por temporada)
│   ├── Tarjeta «Descuentos»: Familiar % · Pago adelantado 3 meses % · 6 meses % · Todo el año (septiembre a junio) %
│   │   └── nota: «Los descuentos se suman sobre la cuota base…»
│   ├── Tarjeta «Clases particulares»: precio por hora por defecto + uno por profesor activo (€/h, vacío = el de por defecto)
│   └── Tarjeta «Datos fiscales del club»: Nombre · NIF · Dirección (salen en recibos y facturas)
├── PaymentDialog («Registrar cobro»)
│   ├── Select «Alumno» (alumnos activos) + texto con sus grupos
│   ├── Chips «Concepto»: Mes · 3 meses · 6 meses · Todo el año (solo con 9 o 10 meses por pagar; cobra todos los que quedan) · Cuota de socio (propuesto según la preferencia de la ficha) · Material (solo si tiene pedidos de material pendientes; añade el select «Pedido de material»)
│   ├── Forma de pago (Efectivo / Transferencia, ToggleButton con icono) | DateField «Fecha»
│   ├── Switch «Descuento especial» → % y «Motivo» (p. ej. «Canje de 5 puntos»)
│   ├── Desglose (fondo arena): líneas de la cotización + «Total a cobrar» grande; «Cubre: septiembre – noviembre 2026»
│   ├── Nota: «El cobro se hace fuera de la aplicación. Aquí solo queda anotado.»
│   └── Pie: Cancelar | «Guardar cobro»
├── OnAccountDialog («Añadir dinero a cuenta»)
│   ├── TextField «Importe (€)» | Forma de pago (Efectivo / Datáfono / Transferencia) | DateField «Fecha»
│   ├── Combobox «Alumnos» (alumnos activos aún no elegidos) + lista «Alumnos elegidos» con chips y botón «Quitar a <nombre>»
│   ├── «Reparto» (fondo arena), una fila por alumno: nombre + total; «Debía X · Y a la cuota de socio · Z a sus cuotas»;
│   │   «Le quedan X pendientes» / «Quedan X a su favor» / «Queda al día»
│   ├── Nota: se reparte según lo que debe cada uno; lo que sobra queda a su favor; cada alumno recibe su recibo
│   └── Pie: Cancelar | «Añadir a cuenta»
├── ReceiptDialog («Recibo»)
│   ├── Hoja imprimible: logo + «Club Ajedrez Puerta Elvira» + «Recibo R-2026-0001 · 3 oct 2026» + NIF del club;
│   │   Alumno · Pagado por · Concepto; líneas; Total; «Forma de pago: Transferencia» (y, si está conciliado, «Conciliado con el banco…», sin Editar ni Borrar)
│   ├── Si tiene factura: bloque «Factura F-2026-0001» con cliente, NIF, dirección, base imponible, IVA 21 % y total
│   ├── Pie: Cerrar | «Borrar» y «Editar» (solo superadministración) | «Emitir factura» (si no la tiene) | «Imprimir» (icono printer)
│   ├── EditPaymentDialog («Editar el cobro <recibo>»): Fecha · Forma de pago · Importe (€) · Motivo (obligatorio si cambia el importe); Cancelar | Guardar
│   │   └── Paso de confirmación: «¿Guardar estos cambios?» con «Campo: antes → después»; Volver | Confirmar
│   └── Confirmación «¿Borrar el cobro <recibo>?»: texto de lo que pasa (las cuotas que cubría vuelven a quedar pendientes) · Motivo (obligatorio); Cancelar | «Borrar cobro» (peligro)
├── InvoiceDialog («Emitir factura»): Nombre o razón social · NIF · Dirección; texto «IVA del 21 % incluido en el precio»; Cancelar | «Emitir factura»
└── WhatsAppDialog («Aviso por WhatsApp»): «Para <tutor> · <teléfono>», textarea «Mensaje» (prerrellenado), nota; Cancelar | «Abrir WhatsApp»

StudentPanel (ficha de alumno) → nueva tarjeta «Cuotas y cobros»
├── Forma de pago preferida (Select) · Socio (Switch) · Precio por hora de particulares (opcional, €/h) · «Guardar»
├── «Precio fijado»: «60,00 € al mes» (lo ve todo el que vea la ficha, si lo hay); superadministración ve siempre el campo «Precio fijado (€ al mes)» con «Guardar precio» y «Quitar precio», y cada uno abre la confirmación «Precio fijado del alumno» con lo que pagará y desde qué mes
├── «Cuotas de la temporada»: fila por mes (mes · importe · «Fijada a mano · motivo» · Cobrada / Faltan X / Pendiente / Vencida / Próxima · lápiz «Editar la cuota de <mes>») + «Saldo a favor» si sobra
│   └── ChargeDialog «Cuota de <mes>»: Importe (€) · Motivo · «Solo este mes | Este y los siguientes» · «Volver a la calculada» (si está fijada a mano) · Cancelar · Guardar
│       └── Paso de confirmación (al bajar una cuota con algo cubierto): «¿Guardar estos cambios?» · «Importe: 55,00 € → 40,00 €» · casilla «Cambiar la cantidad pagada» (marcada) con «El recibo que cubrió la cuota pasa a tener 15,00 € menos, con una línea de corrección.» o, desmarcada, «La diferencia (15,00 €) se quedará como saldo a favor del alumno.» · Volver · Confirmar
├── Puntos: valor + botones «−1» / «+1» (aria-label «Restar un punto» / «Sumar un punto»)
├── «Registrar cobro» (abre PaymentDialog con el alumno elegido)
└── Historial: últimos cobros (fecha · concepto · importe) con «Ver recibo»
```

## 2. Field Inventory

| Campo | Tipo | Requerido | Valor por defecto |
|---|---|---|---|
| Alumno (cobro) | select | sí | el de la fila o la ficha |
| Concepto | chips | sí | según la preferencia (o «Cuota de socio» si se abre desde esa cuota) |
| Forma de pago | toggle | sí | Efectivo |
| Fecha | DateField | sí | hoy |
| Descuento especial % y motivo | número 1–100 y texto | si se activa | — |
| Factura: nombre, NIF, dirección | texto | sí | nombre del tutor |
| WhatsApp: mensaje | textarea | sí | plantilla del diseño |
| Ajustes: importes | decimal € | sí | 55/45/40/35, socio 50, particular 30 |
| Ajustes: descuentos | entero % | sí | 10 / 10 / 15 / 20 |
| Ficha: preferencia | select | sí | Mensual |
| Ficha: precio de particulares | decimal € | no | vacío |

## 3. Responsive

- **Escritorio:** las tablas se muestran como rejillas.
- **Móvil (< md):** las cuotas pasan a ser tarjetas con el nombre, el importe, el concepto, el estado y las acciones; la tabla de cobros registrados se desplaza en horizontal dentro de su tarjeta.
  - Las pestañas se pueden desplazar en horizontal.
  - El recibo ocupa toda la anchura.
- **Impresión:** solo se imprime la hoja del recibo (`print:` oculta el resto).
