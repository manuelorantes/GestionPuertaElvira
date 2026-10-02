# Profesorado

Lista básica de profesores del club, con su nombre y si están activos, para asignarles grupos.
Más adelante se ampliará con tarifas, horas y liquidaciones.
Solo administración puede gestionarla.

### Requirement: Alta y edición de profesores
Administración MUST poder dar de alta profesores con su nombre y apellidos, y cambiarles el nombre.
Un profesor nuevo nace activo.

#### Scenario: Alta
- **WHEN** administración añade un profesor con su nombre
- **THEN** el profesor aparece en la lista como activo y con 0 grupos

### Requirement: Activación y desactivación
Un profesor MUST poder desactivarse y reactivarse.
Un profesor con grupos asignados MUST NOT poder desactivarse.

#### Scenario: Profesor con grupos
- **WHEN** se intenta desactivar a un profesor que tiene grupos
- **THEN** el sistema lo impide e indica cuántos grupos tiene, para asignarlos antes a otro profesor

#### Scenario: Profesor inactivo
- **WHEN** un profesor está inactivo
- **THEN** no se le pueden asignar grupos nuevos

### Requirement: Lista de profesores
La lista MUST mostrar cada profesor ordenado por nombre, con su estado y su número de grupos.

#### Scenario: Consultar la lista
- **WHEN** administración abre la pestaña «Profesores» de Clases
- **THEN** ve todos los profesores con su estado y su número de grupos

### Requirement: Acceso restringido
La gestión del profesorado MUST estar reservada a cuentas de administración.

#### Scenario: Profesorado o anónimo
- **WHEN** una cuenta de profesorado o alguien sin sesión intenta consultar o modificar profesores
- **THEN** el sistema lo rechaza
