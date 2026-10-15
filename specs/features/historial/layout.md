# Layout — Historial

Fuente: la sección «Historial» de la web (solo superadministración) y, para la sección «Pagos», la tabla de
movimientos de Contabilidad, de la que toma la forma.

## 1. Component Hierarchy

```
AuditPage (/panel/historial)
├── SectionHeader: «Quién ha hecho qué, y vuelta atrás» | «Historial»
├── Tabs «Secciones del historial»: General · Alumnos · Pagos · Asistencia y notas (?seccion=alumnos|pagos|asistencia; sin parámetro, General)
└── Card
    ├── Barra de filtros (borde inferior)
    │   ├── General: Select «Persona» (Todas + quien aparece en el historial; ?persona=<id>)
    │   ├── Secciones: PeriodFilter, grupo «Periodo» de chips: Hoy · Esta semana · Este mes · Todo (?periodo=hoy|semana|mes|todo; sin parámetro, Hoy)
    │   └── Nota con icono history: «Cada acción guarda cómo estaban los datos antes y después…» (en Pagos: «Cada cobro tal como se registró; los deshechos restan de la suma.»)
    ├── ActionsHistory (General, Alumnos, Asistencia y notas): tabla «Historial de acciones»
    │   ├── Cabeceras ordenables: Fecha y hora | Persona | Acción | Afecta a
    │   ├── Fila: botón «Ver detalle de <acción>» (chevron) | fecha y hora de Madrid | persona | acción (+ Badge «Deshacer» o «Vuelta atrás») | tablas afectadas · N cambios | «Deshacer» · «Volver aquí»
    │   ├── Fila de detalle (desplegada): por cada registro, «Alta/Cambio/Baja · <tabla> · <título>», botón «Ir a…» y lista campo: antes → después
    │   ├── «Ver más» (secundario) cuando hay más de 50
    │   └── Vacío: «Todavía no hay acciones registradas.» / «No hay cambios de alumnos hoy.» / «No hay asistencias ni notas esta semana.» / «Todavía no hay … registrados.»
    ├── PaymentsHistory (Pagos): tabla «Cobros registrados»
    │   ├── Cabeceras ordenables: Fecha y hora | Recibo | Alumno | Concepto | Forma de pago | Registrado por | Importe (derecha)
    │   ├── Fila: fecha y hora | R-AAAA-NNNN | alumno (enlace a /panel/alumnos/<id>) | concepto (+ línea «Deshacer: Registrar cobro» en warning si se quitó) | Efectivo/Tarjeta/Transferencia | persona | +45 € (success) o −45 € (danger) | flecha «Ir al cobro R-…» (solo los que existen)
    │   ├── «Ver más» cuando hay más de 50
    │   ├── Pie: «N cobros (M deshechos) hoy» … «Total +X €»
    │   └── Vacío: «No hay cobros hoy.» / «Todavía no hay cobros registrados.»
    └── ConfirmDialog «¿Deshacer «<acción>»?» / «¿Volver a este punto?» (en ActionsHistory)
```

## 2. Textos fijos

- Pestañas: «General», «Alumnos», «Pagos», «Asistencia y notas».
- Periodos: «Hoy», «Esta semana», «Este mes», «Todo».
- Toasts: «Acción deshecha», «Vuelta atrás hecha: N cambios deshechos».
