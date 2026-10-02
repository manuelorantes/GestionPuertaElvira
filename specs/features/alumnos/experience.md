# Experience — Alumnos

## 1. User Flows & Navigation

1. Panel → «Alumnos». La URL guarda el filtro y la búsqueda (`?filtro=activos&q=lopez`).
2. **Ficha:** pulsar un alumno abre `/panel/alumnos/:id`.
   En escritorio se pinta como panel lateral sobre la lista; en móvil, como página completa.
   Esc, el botón cerrar o pulsar fuera vuelven a `/panel/alumnos`, conservando el filtro.
3. **Alta:** «Nuevo alumno» → formulario → «Dar de alta».
   - Si el grupo está completo, la API responde `group_full` y aparece la confirmación;
     al confirmar, se reenvía con `confirmOverCapacity: true`.
   - Al terminar, se cierra, aparece el aviso «<Nombre> dado de alta» y se abre su ficha.
4. **Edición:** «Editar» en la ficha → mismo formulario sin las secciones de grupos ni de hermano → «Guardar cambios» → aviso «Cambios guardados».
5. **Baja:** «Dar de baja» → fecha (hoy por defecto) → confirmar → aviso «Baja registrada».
   El estado pasa a «De baja» si la fecha es hoy; si es futura, la ficha muestra «Baja el dd/mm/aaaa».
6. **Grupos desde la ficha:**
   - «Añadir grupo» → elegir → inscribir (con confirmación si está lleno).
   - «Mover» → elegir destino → mover (con confirmación si está lleno).
   - «Quitar» → se quita al momento con el aviso «Quitado de <grupo>».
     Si es su único grupo, se muestra el mensaje `last_enrolment`.
7. **Hermanos:** «Añadir hermano» → elegir → se vinculan los dos.
   «Quitar» desvincula; «Abrir» navega a la ficha del hermano.
8. **Desde Clases:** pulsar un bloque o «Alumnos» en la tabla abre `ClassGroupPanel`,
   donde se puede inscribir a un alumno o abrir la ficha de uno inscrito.

## 2. Interaction & Micro-interactions

- La búsqueda se aplica con un retardo de 250 ms, no distingue mayúsculas ni tildes, y muestra «N de M mostrados».
- El chip activo va en negro (`ink-strong`), como en el diseño.
- La edad se recalcula al cambiar la fecha de nacimiento.
  Si es ≥ 18 aparece «Teléfono del alumno» y los tutores dejan de ser obligatorios;
  si es < 18, se exige el tutor 1 («Un alumno menor necesita al menos un tutor con teléfono.»).
- El interruptor «Federado» muestra u oculta el campo de licencia.
- Los teléfonos de la ficha son enlaces `tel:` para llamar desde el móvil.

## 3. State Management & Logic

| Estado | Dueño |
|---|---|
| Lista | consulta `['students', filtro, q]` |
| Ficha | consulta `['student', id]` |
| Grupos (para los selects) | consulta `['groups']` (compartida con Clases) |
| Filtro, búsqueda y alumno abierto | URL |
| Formulario | `useStudentForm` |
| Confirmación de grupo lleno | `useOverCapacityConfirm` (guarda la acción pendiente y la reintenta confirmada) |

- Tras cualquier cambio se invalidan `students`, `student` y `groups` (la ocupación cambia).
- Los errores `missing_contact` y `unprocessable` marcan el campo indicado en `details.field`
  (`guardians` → Tutor 1, `ownPhone` → Teléfono del alumno, `birthDate`, `nationalId`, `contactEmail`, `federationLicence`).
- Los errores `schedule_overlap`, `already_enrolled` y `last_enrolment` muestran el mensaje de la API en el diálogo o como aviso.
- Carga: «Cargando alumnos…».
  Lista vacía sin filtros: «Todavía no hay alumnos. Da de alta el primero.»
  Con filtros: «No hay alumnos que coincidan con la búsqueda.»

## 4. Accessibility Behavior

- Al abrir la ficha, el foco va al título; al cerrarla, vuelve a la fila de la que salió.
- Los diálogos atrapan el foco (lo resuelve `Dialog`), y la confirmación de grupo lleno lo pone en «Cancelar».
- Los errores de campo se asocian con `aria-describedby`.
