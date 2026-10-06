# Layout — Alumnos

Fuente: sección «Alumnos», ficha lateral y modal «Nuevo alumno» de `GestionClub.dc.html`.
Fuera de esta entrega: cuota, descuentos, estado de pago, socio, puntos e historial de cobros (llegarán con Cobros),
y los botones «Registrar cobro» y «Sumar punto».

## 1. Component Hierarchy

```
StudentsPage (/panel/alumnos)
├── SectionHeader: «N alumnos activos» | «Alumnos» | acción «Nuevo alumno» (icono user-plus)
├── Toolbar (tarjeta superior)
│   ├── SearchField: icono lupa, placeholder «Buscar por nombre»
│   ├── Chips de filtro: Todos · Activos · Hermanos · De baja · Socios sin clases
│   ├── Enlaces: «Datos pendientes (N)» (/panel/alumnos/pendientes) · «Importar hoja»
│   └── Recuento: «N de M mostrados»
├── StudentsTable (escritorio) / StudentCards (móvil)
│   ├── Cabecera (escritorio): Alumno | Grupos | Estado
│   └── Fila (botón): nº de socio | avatar con iniciales + nombre + «12 años» | grupos (nombre y horario) | badge Activo/De baja (+ «Hermanos»)
├── Estado vacío: «No hay alumnos que coincidan con la búsqueda.»
├── StudentPanel (ficha: panel lateral derecho en escritorio; ruta /panel/alumnos/:id en pantalla completa en móvil)
│   ├── Cabecera: avatar, nombre, «12 años · Iniciación A», badge de estado, cerrar, acciones «Editar» y «Dar de baja»
│   ├── Tarjeta «Grupos»: por grupo, nombre, horario, «Aula N · Profesor», acciones «Mover» y «Quitar»; «Añadir grupo»
│   ├── Tarjeta «Datos personales»: fecha de nacimiento, DNI, email, federado (licencia), autorización de imagen, alta, baja
│   └── Tarjeta «Familia y contacto»: tutores con teléfono (enlace tel:), teléfono propio, hermanos con «Abrir» y «Quitar»; «Añadir hermano»
├── StudentDialog («Nuevo alumno» / «Editar alumno»)
│   ├── Sección «Datos del alumno»: Nombre y apellidos · Fecha de nacimiento (DateField) · DNI (opcional) · Email de contacto (opcional)
│   ├── Nota: «Solo el nombre es obligatorio…» con lo que quedará pendiente
│   ├── Sección «Familia y contacto»: Tutor 1 + Teléfono · Tutor 2 (opcional) + Teléfono · Teléfono del alumno
│   │   └── (solo alta) Hermano en el club (select opcional)
│   ├── Sección «Club»: (solo alta) Grupo (select) + «Añadir otro grupo» · interruptor Federado + Nº de licencia · interruptor Autorización de imagen
│   └── Pie: Cancelar | «Dar de alta» o «Guardar cambios»
├── WithdrawDialog: «Dar de baja a <nombre>», DateField «Fecha de baja» (por defecto hoy), texto «Desde ese día deja de ocupar plaza en sus grupos.», Cancelar | «Dar de baja»
├── GroupPickerDialog: «Añadir grupo» o «Mover de <grupo>», con un select de grupos (nombre · horario · ocupación N/M), Cancelar | Confirmar
├── SiblingPickerDialog: «Añadir hermano», con un select de alumnos activos
└── OverCapacityConfirm (ConfirmDialog): «El grupo está completo (12/12). ¿Inscribir igualmente?», Cancelar | «Inscribir igualmente»

ClassGroupPanel (Clases → pulsar un grupo; ficha lateral)
├── Cabecera: nombre, horario · aula, profesor, modalidad, OccupancyBar, «Editar grupo»
├── Lista de alumnos inscritos (nombre + edad, botón «Ver ficha»)
└── «Inscribir alumno»: select de alumnos activos que no están en el grupo + «Inscribir» (con OverCapacityConfirm)
```

## 2. Field Map (Full Field Parity)

| Campo | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| fullName | «Nombre y apellidos» | texto | sí | placeholder «p. ej. Lucía Fernández Ortiz» |
| birthDate | «Fecha de nacimiento» | `DateField` (día / mes / año) | sí | — |
| nationalId | «DNI o NIE (opcional)» | texto | no | placeholder «12345678Z» |
| contactEmail | «Email de contacto (opcional)» | email | no | — |
| guardians[0] | «Tutor 1» + «Teléfono tutor 1» | texto + tel | no (pendiente si es menor) | — |
| guardians[1] | «Tutor 2 (opcional)» + «Teléfono tutor 2» | texto + tel | no | — |
| ownPhone | «Teléfono del alumno» | tel | sí si es adulto sin tutor | visible si la edad calculada es ≥ 18 |
| siblingId | «Hermano en el club (opcional)» | select | no | solo en el alta |
| schedule | «Horario N»: «Día», «Empieza», «Termina» (+ «Aula para …» si hay varias aulas) | selects | no (sin horario = socio sin clases) | la API traduce cada tramo a un grupo, completo o con horario especial; vista previa debajo |
| federationLicence | interruptor «Federado» + «Nº de licencia federativa» | switch + texto | licencia si está federado | placeholder «AND-00000» |
| imageConsent | interruptor «Autorización de imagen» | switch | — | ayuda: «Permite usar fotos del alumno en redes y cartelería del club.» |
| withdrawal date | «Fecha de baja» | `DateField` | sí | no anterior a hoy |

## 3. Basic Interaction Intents

- Buscar filtra mientras se escribe; los chips cambian el filtro.
- Pulsar una fila abre la ficha.
- Las acciones de la ficha abren sus diálogos.
- «Abrir» en un hermano cambia la ficha a la de ese hermano.

## 4. Accessibility Structure

- La búsqueda es `role="searchbox"`, con la etiqueta accesible «Buscar alumnos».
- Los chips de filtro son `ToggleButton` en un grupo con `aria-label="Filtros"`.
- Las filas son botones con el nombre del alumno como nombre accesible.
- La ficha es `role="dialog"` con `aria-labelledby` apuntando al nombre del alumno.
- `DateField` agrupa tres selects (día, mes, año) en un `fieldset` con `legend`.
