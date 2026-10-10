# Layout — Clases

Fuente: sección «Clases» de `GestionClub.dc.html`.
La lista de profesores está en Profesores → Equipo; aquí, la pestaña «Asistencia».
La pestaña «Ocupación por meses» queda fuera de esta entrega porque aún no hay historia.

## 1. Component Hierarchy

```
ClassesPage (/panel/clases)
├── SectionHeader: antetítulo «Lunes a viernes · 3 aulas · N grupos», título «Clases», acción «Nuevo grupo» (icono plus)
├── Tabs: «Horario semanal» | «Grupos» | «Asistencia»
├── [Horario semanal] WeeklySchedule (tarjeta con scroll horizontal en pantallas estrechas)
│   ├── Leyenda de niveles: Iniciación, Intermedio, Avanzado y competición, Particulares
│   ├── Selector de aula: «Todas» (las tres aulas en columnas, vista resumida) | «Aula Alfil» | «Aula Caballo» | «Aula Peón» (solo esa aula, una columna por día, tarjetas con nombre, hora, profesor y ocupación)
│   ├── Columna de horas: 16:00, 17:00, 18:00, 19:00, 20:00
│   └── Por día (Lunes…Viernes): cabecera con el día y «Alfil | Caballo | Peón», rejilla de medias horas 16:00–21:00
│       └── ScheduleBlock por grupo (el color ya dice el nivel): **Profesor** en negrita y «9/10 plazas»; en particulares, **nombre** en negrita y «Profesor · 1/1» (borde discontinuo). Sin hora: la da la rejilla
├── [Grupos] GroupsTable (tarjeta)
│   ├── Cabecera: Grupo | Nivel | Profesor | Horario | Aula | Ocupación | (acciones)
│   └── Fila: color de nivel + nombre | nivel | profesor | horario + modalidad | «Aula Alfil» | barra + «9/12» (+ «Sobre el cupo») | botón «Editar» (icono lápiz)
├── [Asistencia] AttendanceTab: selector «Grupo» + meses de la temporada; tarjeta con GroupAttendanceTable
│   ├── GroupAttendanceTable: Alumno (ordenable, enlace a la ficha) | un día por columna («mar» + «13/10», «Festivo» o «Sin lista») con ✓ / ✗ / ? / vacío | % (ordenable; < 75 % en rojo); leyenda debajo
│   └── Tarjeta aparte, debajo: GroupClassComments «Comentarios»: botón «Añadir comentario» (Día de la clase, Sobre: toda la clase o un alumno, Comentario); «De la clase» (día · autor); «De los alumnos» con selector «Alumno» (Todos los alumnos o uno de la tabla); editar y quitar en cada uno
├── ClassGroupPanel (panel lateral al pulsar un grupo)
│   ├── Cabecera: color de nivel, nombre, «Profesor · modalidad», aula, ocupación (por día si hay horarios especiales), botón «Editar»
│   ├── Tarjeta «Alumnos inscritos»: fila por alumno «Nombre · N años» + «Ver ficha»
│   ├── Tarjeta «Inscribir alumno»: desplegable con búsqueda (al abrirlo salen todos los alumnos activos no inscritos; al escribir se filtran por nombre o apellidos, sin tildes ni mayúsculas) + botón «Inscribir»
│   ├── Tarjeta «Asistencia»: MonthNav (mes en curso) + GroupAttendanceTable
│   └── Tarjeta «Comentarios»: GroupClassComments
└── ClassGroupDialog (alta o edición)
    ├── Título «Nuevo grupo» | «Editar grupo», botón cerrar
    ├── Nombre del grupo (opcional; el placeholder muestra el nombre por defecto que tendrá: día, hora, nivel y aula)
    ├── Nivel (select) | Profesor (select, solo activos)
    ├── Días: botones conmutables Lun Mar Mié Jue Vie
    ├── Empieza (select 16:00…20:30) | Termina (select 16:30…21:00)
    ├── Aula: botones «Aula Alfil» «Aula Caballo» «Aula Peón» | Plazas: stepper − N plazas +
    ├── Texto: «N h semanales. La cuota se asigna según las horas semanales.»
    ├── Alert de conflicto (condicional): «Coincide en el aula Alfil con «Grupo» (Lun · 17:00–18:00). Cambia el aula o el horario.»
    └── Pie: «Cancelar» | «Crear grupo» o «Guardar cambios»
```

## 2. Field Map (Full Field Parity)

| Elemento | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Nombre | «Nombre del grupo» | texto | no | 2–80 caracteres; vacío = nombre por defecto («Lunes 17:00 · Iniciación · Peón») |
| Nivel | «Nivel» | select | sí | Iniciación, Intermedio, Avanzado, Particular |
| Profesor | «Profesor» | select | sí | Profesores activos por nombre; sin profesores, aviso «Añade antes un profesor en Profesores → Equipo» |
| Días | «Días» | botones conmutables (`aria-pressed`) | al menos uno | Lun–Vie |
| Inicio | «Empieza» | select | sí | 16:00–20:30 cada 30 min |
| Fin | «Termina» | select | sí | 16:30–21:00 cada 30 min |
| Aula | «Aula» | tres botones (`aria-pressed`) | sí | Alfil, Caballo o Peón |
| Plazas | «Plazas» | stepper con botones «Quitar plaza» y «Añadir plaza» | sí | 1–30; 10 por defecto |
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
