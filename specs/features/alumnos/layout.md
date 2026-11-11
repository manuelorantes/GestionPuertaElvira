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
│   ├── Chips de filtro: Activos (por defecto) · Socios sin clases · De baja
│   ├── Enlaces: «Datos pendientes (N)» (/panel/alumnos/pendientes) · «Importar hoja»
│   ├── Aviso (solo si hay alguno): «N socios provisionales por completar» → /panel/alumnos/provisionales
│   └── Recuento: «N de M mostrados»
├── StudentsTable (escritorio) / StudentCards (móvil)
│   ├── Cabecera (escritorio): Alumno | Grupos | Estado
│   ├── Cabecera: «Nº» y «Alumno» son botones para ordenar por número de socio o alfabéticamente (?orden=numero|-numero|nombre|-nombre; pulsar otra vez invierte; por defecto, por nombre)
│   └── Fila (botón): nº de socio | avatar con iniciales + nombre + «12 años» | grupos (nombre y horario) | badge Activo/De baja (+ «Hermanos»)
├── Estado vacío: «No hay alumnos que coincidan con la búsqueda.»
├── StudentPanel (ficha: panel lateral derecho en escritorio; ruta /panel/alumnos/:id en pantalla completa en móvil)
│   ├── Cabecera: avatar, nombre, «12 años · Iniciación A», badge de estado, cerrar, acciones «Editar», «Emitir certificado» (icono file-badge; no si está de baja) y «Dar de baja»
│   ├── Tarjeta «Grupos»: por grupo, nombre, horario, «Aula N · Profesor», acciones «Mover» y «Quitar»; «Añadir grupo»
│   ├── Tarjeta «Datos personales»: fecha de nacimiento, DNI, email, federado (licencia), autorización de imagen, alta, baja
│   ├── Tarjeta «Contacto»: tutores con teléfono (enlace tel:) y teléfono propio
│   ├── Tarjeta «Familia directa en el club»: cada familiar con «Abrir» y «Quitar»; «Añadir familia directa»
│   └── Tarjeta «Certificados emitidos» (solo administración): por certificado, «Matrícula 2026/2027 · dd/mm/aaaa» y «Firmante (cargo) · con firma escaneada | para firmar a mano · emitido por X»; abre la hoja para imprimirla otra vez; vacía: «Sin certificados emitidos.»
├── CertificateDialog «Certificado de matrícula»: «De <nombre>, en el club desde el dd/mm/aaaa.», DNI o NIE (ayuda: «No consta en su ficha: se guardará en ella.» o «Si lo cambias, también se cambia en su ficha.») · Curso · Lugar · Horario de clase · DateField «Fecha del certificado» · Firma · Cargo · Switch «Con la firma escaneada» (desactivado sin firma subida o con otro firmante, con el porqué) | Cancelar | «Emitir certificado»
├── Hoja del certificado (diálogo grande, «Certificado de <nombre>»; al imprimir solo sale la hoja): logo, nombre del club y «NIF · dirección» con filete de marca; título «Certificado de matrícula»; «<Firmante>, <cargo> del <club>,» «CERTIFICA:» «Que <alumno>, con DNI <dni>, tiene matrícula en el <club> para el curso <curso>, en horario de clase <horario>, y pertenece al club desde el <fecha larga>.» «En <lugar>, a <fecha larga>.»; a la derecha, la firma escaneada o el hueco, «Fdo.: <firmante>» y el cargo | Cerrar | «Imprimir»
├── StudentDialog («Nuevo alumno» / «Editar alumno»)
│   ├── Sección «Datos del alumno»: Nombre y apellidos · Fecha de nacimiento (DateField) · DNI (opcional) · Email de contacto (opcional)
│   ├── Nota: «Solo el nombre es obligatorio…» con lo que quedará pendiente
│   ├── Sección «Contacto»: Tutor 1 + Teléfono · Tutor 2 (opcional) + Teléfono · Teléfono del alumno
│   ├── (solo alta) Sección «Familia directa en el club»: select opcional
│   ├── Sección «Club»: (solo alta) Grupo (select) + «Añadir otro grupo» · interruptor Federado + Nº de licencia · interruptor Autorización de imagen
│   ├── (solo alta) Interruptor «Socio provisional» (ayuda: «Ha pagado la cuota de socio, pero falta su hoja de inscripción. Recibe número de socio al pasarlo a socio.»); activado, oculta el horario y la familia directa
│   └── Pie: Cancelar | «Dar de alta» o «Guardar cambios»
├── ProvisionalMembersPage (/panel/alumnos/provisionales): enlace «Alumnos», «N socios provisionales» | «Socios provisionales», tarjeta con una fila por socio (avatar, nombre, «Alta el dd/mm/aaaa»), que abre su ficha; vacía: «No hay socios provisionales.»
├── Ficha de un socio provisional: badge «Provisional» en lugar del número y del estado; acciones «Editar» y «Pasar a socio» (sin «Dar de baja», grupos ni familia directa); aviso «Socio provisional: falta su hoja de inscripción. Pásalo a socio cuando la tengas.»
├── ConfirmDialog «Pasar a socio»: «<Nombre> recibirá el siguiente número de socio y aparecerá en la lista de alumnos.», Cancelar | «Pasar a socio»
├── WithdrawDialog: «Dar de baja a <nombre>», DateField «Fecha de baja» (por defecto hoy), texto «Desde ese día deja de ocupar plaza en sus grupos.», Cancelar | «Dar de baja»
├── GroupPickerDialog: «Añadir grupo» o «Mover de <grupo>», con un select de grupos (nombre · horario · ocupación N/M), Cancelar | Confirmar
├── SiblingPickerDialog: «Añadir familia directa», con un select de alumnos activos
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
| siblingId | «Familia directa en el club (opcional)» | select | no | solo en el alta |
| schedule | «Horario N»: «Día», «Empieza», «Termina» (+ «Grupo para …» si hay varios grupos posibles, con opciones «Aula X · Grupo») | selects | no (sin horario = socio sin clases) | la API traduce cada tramo a un grupo, completo o con horario especial; vista previa debajo |
| federationLicence | interruptor «Federado» + «Nº de licencia federativa» | switch + texto | licencia si está federado | placeholder «AND-00000» |
| imageConsent | interruptor «Autorización de imagen» | switch | — | ayuda: «Permite usar fotos del alumno en redes y cartelería del club.» |
| withdrawal date | «Fecha de baja» | `DateField` | sí | no anterior a hoy |

## 3. Basic Interaction Intents

- Buscar filtra mientras se escribe; los chips cambian el filtro.
- Pulsar una fila abre la ficha.
- Las acciones de la ficha abren sus diálogos.
- «Abrir» en un familiar cambia la ficha a la de ese familiar.

## 4. Accessibility Structure

- La búsqueda es `role="searchbox"`, con la etiqueta accesible «Buscar alumnos».
- Los chips de filtro son `ToggleButton` en un grupo con `aria-label="Filtros"`.
- Las filas son botones con el nombre del alumno como nombre accesible.
- La ficha es `role="dialog"` con `aria-labelledby` apuntando al nombre del alumno.
- `DateField` agrupa tres selects (día, mes, año) en un `fieldset` con `legend`.
