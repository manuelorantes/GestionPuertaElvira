# Clean implementation plan — Alumnos

## Component Responsibilities

| Componente | Responsabilidad |
|---|---|
| `pages/panel/students/StudentsPage` | Cabecera, barra de búsqueda y filtros (URL), lista, ficha según la ruta, diálogo de alta |
| `pages/panel/students/StudentsList` | Filas en escritorio y tarjetas en móvil; recibe `onOpen` |
| `pages/panel/students/StudentPanel` | Ficha: carga por id, tarjetas y acciones (abre los diálogos) |
| `pages/panel/students/StudentDialog` | Formulario de alta o edición sobre `useStudentForm` |
| `pages/panel/students/WithdrawDialog` | Fecha de baja |
| `pages/panel/students/GroupPickerDialog` | Elegir grupo para añadir o mover |
| `pages/panel/students/SiblingPickerDialog` | Elegir hermano |
| `pages/panel/classes/ClassGroupPanel` | Ficha de grupo con alumnos e inscripción |
| `shared/ui/DateField` | Fecha día / mes / año (exigida por el framework) con valor ISO |
| `shared/ui/ConfirmDialog` | Confirmación genérica |
| `shared/ui/SidePanel` | Panel lateral (escritorio) o página completa (móvil), accesible |
| `shared/ui/Avatar` | Iniciales en círculo |

## File Organisation

```
src/features/students/
  api.ts                 tipos (StudentSummary, StudentDetail, StudentPayload) y llamadas
  hooks.ts               consultas y mutaciones (invalidan students, student y groups)
  useStudentForm.ts      valores, edad derivada, reglas de contacto, errores de API por campo
  useOverCapacityConfirm.ts   reintento confirmado ante group_full
  format.ts              fechas dd/mm/aaaa, iniciales y estado
src/pages/panel/students/…
src/shared/ui/{DateField,ConfirmDialog,SidePanel,Avatar}.tsx
```

## State Ownership

- **Servidor:** TanStack Query.
- **URL:** filtro, búsqueda y alumno abierto (ruta anidada `/panel/alumnos/:id`).
- **Local:** diálogos abiertos dentro de `StudentPanel` (un único estado discriminado `{ kind: 'edit' | 'withdraw' | 'addGroup' | 'move' | 'sibling' }`).
- **Derivados en render:** edad, campos visibles y recuentos.

## Hook Extraction Plan

- `useStudentForm(initial, mode)`: toda la lógica del formulario fuera del JSX.
- `useOverCapacityConfirm()`: `run(action)` ejecuta la acción; ante `group_full`, guarda la acción, muestra la confirmación y, al aceptar, la repite con `confirmOverCapacity: true`.
  Lo usan el alta, añadir grupo, mover e inscribir desde Clases.
- `useDebouncedValue(value, ms)`: compartido en `shared/` porque la búsqueda lo necesita y es genérico.

## Rendering Structure

`StudentsPage` pinta siempre la lista.
La ruta hija `:id` pinta `StudentPanel` dentro de un `SidePanel`, encima de la lista.
`StudentPanel` compone las tarjetas con `Card` y monta el diálogo activo.

## Form and Validation Structure

- Validación local en `useStudentForm`: nombre, fecha, tutor si es menor, teléfono si es adulto sin tutor, al menos un grupo en el alta, y licencia si está federado.
- Errores de la API: `details.field` se traduce a un error del campo; el resto, a un `Alert` general.

## Reuse of Local Primitives

Se reutilizan `Dialog`, `Button`, `TextField`, `Select`, `Switch`, `ToggleButton` (chips), `Badge`, `Card`, `SectionHeader`, `OccupancyBar`, `Toast` y `Alert`.

## Conditional Rendering Strategy

- Condiciones con nombre: `isMinor`, `needsOwnPhone`, `isEdit` e `isWithdrawn`.
- El diálogo activo de la ficha es un mapa por `kind`.

## Anti-Cleanup Checklist

- [ ] La lógica de reintento ante grupo lleno existe una sola vez (`useOverCapacityConfirm`).
- [ ] Las reglas de contacto en cliente son un espejo exacto de la API y viven solo en `useStudentForm`.
- [ ] Las fechas se muestran siempre con `format.ts`, y se introducen siempre con `DateField`.
- [ ] Ningún color hexadecimal; tests por comportamiento.
