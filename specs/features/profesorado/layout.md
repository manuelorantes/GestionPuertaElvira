# Layout — Profesorado

Fuente: sección «Profesores» (pestañas Rentabilidad, Registro de horas y Liquidación mensual) y modal «Registrar horas»
de `GestionClub.dc.html`. La lista de profesores con su tarifa sigue en Clases → Profesores.

## 1. Component Hierarchy

```
TeachersPayPage (/panel/profesores)
├── SectionHeader: «5 profesores · pago por hora» | «Profesores» | acción «Registrar horas» (icono plus)
├── Barra de mes: «Mes anterior» · «Septiembre 2026» · «Mes siguiente» (?mes=AAAA-MM; por defecto el actual,
│   y el anterior en Liquidación porque se paga a mes vencido)
├── Tabs: Rentabilidad · Registro de horas · Liquidación mensual (?pestana=rentabilidad|horas|liquidacion)
├── ProfitabilityTab
│   ├── 3 tarjetas: Horas impartidas · Coste de profesores · Margen de las clases (del mes)
│   └── Tarjeta «Rentabilidad · <mes>» con «Ordenar por» (Margen · € por hora · Ocupación) y tabla:
│       Profesor (avatar oscuro, nombre, badge «Más rentable», grupos) | Horas | Tarifa | Coste | Ingresos |
│       Margen (barra + importe) | € por hora | Ocupación (%)
│       └── Nota: «Ingresos = cuotas cobradas de los alumnos de sus grupos, repartidas según sus horas. Margen = ingresos − coste de sus horas.»
├── SessionsTab
│   ├── Filtro «Profesor» (Select: Todos + profesores) · resumen «N sesiones · X h · Y €» · botón «Marcar festivo» (abre HolidayDialog)
│   └── Tabla: Fecha | Profesor | Clase | Horas | Coste | acciones (Editar · Quitar); filas bloqueadas con candado «Pagada»
├── SettlementsTab
│   ├── Tarjeta: «Liquidación de <mes>» + «Se paga a mes vencido, según las horas registradas.» | Total del mes | Pendiente · N | «Marcar todas como pagadas»
│   └── Tabla: (desplegar) | Profesor | Horas | Tarifa | Importe | Estado (Pendiente/Pagada el dd/mm) | Imprimir · «Marcar como pagada»
│       └── Detalle desplegado: líneas por grupo (nombre · horas · importe)
├── SessionDialog («Registrar horas» / «Editar sesión»): Profesor · Clase (grupo u «Otra actividad» + descripción) · Fecha (DateField) · Horas (−/+ de 0,5) ·
│   «Coste a 16 €/h: 24 €» · Cancelar | «Guardar horas»   (al editar: solo Profesor y Horas)
├── HolidayDialog («Marcar festivo»): DateField · aviso «Se quitarán todas las sesiones de ese día (salvo liquidaciones pagadas).» · Cancelar | «Marcar festivo»
└── SettlementSheetDialog («Liquidación»): hoja imprimible (receipt-sheet): club, «Liquidación <mes> · <profesor>», líneas por grupo, total horas × tarifa = importe, estado; Cerrar | Imprimir
```

## 2. Responsive
Las tablas se desplazan en horizontal dentro de su tarjeta en móvil; las tarjetas de totales se apilan.
