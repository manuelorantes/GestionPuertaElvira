# Clean implementation plan — Clases

## Component Responsibilities

| Componente | Responsabilidad |
|---|---|
| `pages/panel/classes/ClassesPage` | Cabecera, pestañas según la URL, apertura del diálogo |
| `pages/panel/classes/WeeklySchedule` | Rejilla de días y aulas; recibe los grupos y `onSelect` |
| `pages/panel/classes/ScheduleBlock` | Un bloque coloreado por nivel |
| `pages/panel/classes/GroupsTable` | Tabla con ocupación y «Editar» |
| `pages/panel/classes/TeachersPanel` | Alta y edición en línea de profesores (con `useTeacherRow`) |
| `pages/panel/classes/ClassGroupDialog` | Formulario sobre `useGroupForm` |
| `shared/ui/Tabs` | Pestañas accesibles controladas (`value`, `onChange`) |
| `shared/ui/Card` | Superficie con borde, radio y sombra |
| `shared/ui/Select` | Select con etiqueta, error y estilo de `TextField` |
| `shared/ui/ToggleButton` | Botón conmutable (`aria-pressed`) con variantes `brand` e `ink` |
| `shared/ui/Switch` | Interruptor accesible |
| `shared/ui/Badge` | Etiqueta de estado (`success`, `warning`, `danger`, `neutral`) |
| `shared/ui/OccupancyBar` | Barra `role="meter"` con «N/M» y «Sobre el cupo» |
| `shared/ui/SectionHeader` | Antetítulo, título y acción opcional (lo reutilizarán todas las secciones) |
| `shared/ui/Toast` + `useToast` | Avisos efímeros («Grupo creado») |

## File Organisation

```
src/features/classes/
  api.ts                       tipos ClassGroup, Teacher, GroupPayload y llamadas
  useGroups.ts · useTeachers.ts             consultas
  useSaveGroup.ts · useSaveTeacher.ts       mutaciones que invalidan groups y teachers
  useGroupForm.ts              estado del formulario, horas semanales derivadas, validación y errores de la API
  levels.ts                    etiqueta, clases de color y estilo de borde por nivel; etiquetas de plan semanal
  schedule.ts                  funciones puras: horas, filas de la rejilla, agrupar por día
src/pages/panel/classes/…      componentes de la sección
src/shared/ui/…                primitivos nuevos
```

## State Ownership

- **Servidor:** TanStack Query (`groups` y `teachers`), única fuente de verdad.
- **URL:** pestaña activa.
- **Local:** diálogo abierto (`ClassesPage`) y fila de profesor en edición (`TeachersPanel`).
- **Derivados en render:** horas semanales, filas del horario y grupos por día. Nada se guarda en estado.

## Hook Extraction Plan

- `useGroupForm(initial)`: valores, `toggleDay`, `setClassroom`, `stepCapacity`, `weeklyHours`, errores por campo, `conflict` y `submit`.
- `useTeacherRow(teacher)`: edición en línea (nombre y activo), guardado y error.
- `useTabParam()`: pestaña leída y escrita en la URL (local a Clases hasta que otra sección la necesite).

## Rendering Structure

`ClassesPage` → `SectionHeader` + `Tabs` + panel según la pestaña.
Ningún panel conoce a los demás.
`WeeklySchedule` pinta cada día como una rejilla CSS de 2 columnas × 10 filas, y los bloques se colocan con `gridRow` y `gridColumn` calculados en `schedule.ts`.

## Form and Validation Structure

- Validación local (días, fin > inicio) antes de enviar; el resto lo valida la API.
- `apiErrorMessage` para errores generales; `details.field` para marcar el campo; `classroom_conflict` con su propia alerta.

## Reuse of Local Primitives

- `Dialog`, `Button`, `TextField`, `Alert` y `ClubLogo` ya existen.
- `Select`, `ToggleButton`, `Switch`, `Badge`, `Card`, `Tabs`, `OccupancyBar`, `SectionHeader` y `Toast` se crean ahora, porque Alumnos los reutilizará.
- Los colores por nivel salen de los tokens del nivel en `index.css`.

## Conditional Rendering Strategy

- Pestañas: un mapa `{ horario: <WeeklySchedule/>, grupos: <GroupsTable/>, profesores: <TeachersPanel/> }`.
- Estados de carga y vacío con retornos tempranos dentro de cada panel.
- Condiciones con nombre: `isFull = occupied >= capacity` e `isOverCapacity = occupied > capacity`.

## Anti-Cleanup Checklist

- [ ] La lógica de colocación del horario vive solo en `schedule.ts` (pura y probada).
- [ ] Las etiquetas y colores de nivel viven solo en `levels.ts`.
- [ ] Ningún color hexadecimal en componentes.
- [ ] Las invalidaciones de caché viven en los hooks de mutación.
- [ ] Los primitivos nuevos tienen test y están documentados en la guía de estilo.
