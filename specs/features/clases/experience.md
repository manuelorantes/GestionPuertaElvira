# Experience — Clases

## 1. User Flows & Navigation

1. Panel → «Clases» (barra lateral) → pestaña «Horario semanal» por defecto.
   La pestaña elegida se refleja en la URL (`?pestana=grupos`) para poder compartirla y volver a ella.
2. **Crear grupo:** «Nuevo grupo» → rellenar → «Crear grupo».
   - Si se guarda, el diálogo se cierra, el grupo aparece en el horario y en la tabla, y se muestra el aviso «Grupo «Nombre» creado».
   - Si hay conflicto de aula, el diálogo sigue abierto con la alerta del grupo con el que coincide.
3. **Editar grupo:** desde «Editar» en la tabla o pulsando un bloque del horario. Mismo diálogo, con «Guardar cambios».
4. **Profesores:** añadir, renombrar, activar o desactivar.
   Si se intenta desactivar a uno con grupos, se muestra el motivo de la API
   («No se puede desactivar: tiene 2 grupos asignados…») y el profesor sigue activo.

## 2. Interaction & Micro-interactions

- El texto de horas semanales se recalcula mientras se cambian días y horas.
- Si la hora de fin no es posterior a la de inicio, se avisa en el campo «Termina»
  («La hora de fin debe ser posterior a la de inicio.») y no se envía.
- Sin días seleccionados: «Elige al menos un día.»
- Los botones de días y aulas muestran el estado activo con relleno (verde para días, negro para aula), como en el diseño.
- El stepper de plazas no baja de 1 ni sube de 30; en los extremos, el botón correspondiente queda deshabilitado.
- Los bloques del horario tienen sombra al pasar el ratón; los particulares llevan borde discontinuo.
- Los grupos llenos se marcan con la barra en `brand-strong`; los que tienen más alumnos que plazas, con el badge «Sobre el cupo».

## 3. State Management & Logic

| Estado | Dueño |
|---|---|
| Grupos | consulta `['groups']` (`GET /api/admin/groups`) |
| Profesores | consulta `['teachers']` (`GET /api/admin/teachers`) |
| Pestaña activa | parámetro de URL `pestana` (`horario` por defecto) |
| Diálogo de grupo | estado local de `ClassesPage`: `{ mode: 'create' } | { mode: 'edit', group }` o nada |
| Formulario de grupo | `useGroupForm` (valores, validación local, mutación y error de la API) |

- Tras crear o editar un grupo se invalidan `groups` y `teachers` (este último por el recuento de grupos).
- Errores de la API: `classroom_conflict` aparece como alerta en el diálogo con su `details`;
  `unprocessable` se muestra en el campo indicado por `details.field`; el resto, como mensaje general.
- Estados de carga: esqueleto con «Cargando grupos…».
  Sin grupos: «Todavía no hay grupos. Crea el primero con «Nuevo grupo».»
  Sin profesores: aviso en la pestaña Profesores y en el diálogo.

Colocación en el horario: la fila de inicio es `(inicio − 16:00) / 30 min + 1` y la de fin, `(fin − 16:00) / 30 min + 1`;
la columna es el aula (1 o 2) dentro de cada día.

## 4. Accessibility Behavior

- Pestañas navegables con flechas izquierda y derecha, con activación automática.
- Al abrir el diálogo, el foco va a «Nombre del grupo»; al cerrarlo, vuelve al botón que lo abrió (lo resuelve `Dialog`).
- La alerta de conflicto se anuncia (`role="alert"`).
- La rejilla del horario tiene scroll horizontal con foco de teclado (`tabindex="0"` y `aria-label="Horario semanal"`).
