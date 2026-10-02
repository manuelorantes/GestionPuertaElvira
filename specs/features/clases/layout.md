# Layout — Clases

Fuente: sección «Clases» de `GestionClub.dc.html`.
Se añade la pestaña «Profesores» (lista básica).
La pestaña «Ocupación por meses» queda fuera de esta entrega porque aún no hay historia.

## 1. Component Hierarchy

```
ClassesPage (/panel/clases)
├── SectionHeader: antetítulo «Lunes a viernes · 2 aulas · N grupos», título «Clases», acción «Nuevo grupo» (icono plus)
├── Tabs: «Horario semanal» | «Grupos» | «Profesores»
├── [Horario semanal] WeeklySchedule (tarjeta con scroll horizontal en pantallas estrechas)
│   ├── Leyenda de niveles: Iniciación, Intermedio, Avanzado y competición, Peques y jóvenes, Adultos, Particulares
│   ├── Columna de horas: 16:00, 17:00, 18:00, 19:00, 20:00
│   └── Por día (Lunes…Viernes): cabecera con el día y «Aula 1 | Aula 2», rejilla de medias horas 16:00–21:00
│       └── ScheduleBlock por grupo: nombre, «17:00–18:00», «Profesor · 9/12» (borde discontinuo si es particular)
├── [Grupos] GroupsTable (tarjeta)
│   ├── Cabecera: Grupo | Nivel | Profesor | Horario | Aula | Ocupación | (acciones)
│   └── Fila: color de nivel + nombre | nivel | profesor | horario + modalidad | «Aula N» | barra + «9/12» (+ «Sobre el cupo») | botón «Editar» (icono lápiz)
├── [Profesores] TeachersPanel (tarjeta)
│   ├── Formulario en línea: campo «Nombre y apellidos» + botón «Añadir profesor»
│   └── Fila por profesor: nombre | «N grupos» | badge Activo/Inactivo | botón «Editar» → edición en línea: nombre, interruptor «Activo», «Guardar» y «Cancelar»
└── ClassGroupDialog (alta o edición)
    ├── Título «Nuevo grupo» | «Editar grupo», botón cerrar
    ├── Nombre del grupo (placeholder «p. ej. Iniciación F»)
    ├── Nivel (select) | Profesor (select, solo activos)
    ├── Días: botones conmutables Lun Mar Mié Jue Vie
    ├── Empieza (select 16:00…20:30) | Termina (select 16:30…21:00)
    ├── Aula: botones «Aula 1» «Aula 2» | Plazas: stepper − N plazas +
    ├── Texto: «N h semanales. La cuota se asigna según las horas semanales.»
    ├── Alert de conflicto (condicional): «Coincide en el aula N con «Grupo» (Lun · 17:00–18:00). Cambia el aula o el horario.»
    └── Pie: «Cancelar» | «Crear grupo» o «Guardar cambios»
```

## 2. Field Map (Full Field Parity)

| Elemento | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Nombre | «Nombre del grupo» | texto | sí | 2–60 caracteres |
| Nivel | «Nivel» | select | sí | Iniciación, Intermedio, Avanzado, Peques y jóvenes, Adultos, Particular |
| Profesor | «Profesor» | select | sí | Profesores activos por nombre; sin profesores, aviso «Añade antes un profesor en la pestaña Profesores» |
| Días | «Días» | botones conmutables (`aria-pressed`) | al menos uno | Lun–Vie |
| Inicio | «Empieza» | select | sí | 16:00–20:30 cada 30 min |
| Fin | «Termina» | select | sí | 16:30–21:00 cada 30 min |
| Aula | «Aula» | dos botones (`aria-pressed`) | sí | 1 o 2 |
| Plazas | «Plazas» | stepper con botones «Quitar plaza» y «Añadir plaza» | sí | 1–30 |
| Profesor nuevo | «Nombre y apellidos» | texto | sí | — |
| Activo | «Activo» | interruptor (`role="switch"`) | — | — |

## 3. Basic Interaction Intents

- «Nuevo grupo» abre el diálogo vacío.
  «Editar» (en la fila o en un bloque del horario) abre el diálogo con los datos del grupo.
- Guardar crea o actualiza el grupo; «Cancelar» cierra sin cambios.
- «Añadir profesor» crea un profesor activo.
  «Editar» en un profesor permite cambiarle el nombre y activarlo o desactivarlo.

## 4. Accessibility Structure

- Pestañas con `role="tablist"`, `role="tab"`, `aria-selected` y paneles `role="tabpanel"`.
- Cada bloque del horario es un botón cuyo nombre accesible es «Grupo, día(s), horas, profesor, ocupación».
- Tabla de grupos con `<table>`, encabezados `<th scope="col">` y `<caption>` oculto «Grupos».
- La barra de ocupación usa `role="meter"` con `aria-valuenow` y `aria-valuemax`.
