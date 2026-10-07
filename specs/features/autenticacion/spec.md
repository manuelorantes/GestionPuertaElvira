# Autenticación y usuarios con roles

Solo las personas con una cuenta activa acceden al panel de administración.
Cada cuenta pertenece a una persona, se identifica con email y contraseña, y tiene un rol.
La web pública es accesible sin sesión.

### Requirement: Inicio de sesión
El sistema MUST permitir iniciar sesión con el email y la contraseña de una cuenta activa,
sin distinguir mayúsculas ni espacios alrededor del email.

#### Scenario: Credenciales correctas
- **WHEN** una persona introduce el email y la contraseña de su cuenta activa
- **THEN** entra al panel y ve la pantalla de resumen con su nombre y su rol

#### Scenario: Credenciales incorrectas
- **WHEN** el email no existe, la contraseña no coincide o la cuenta está desactivada
- **THEN** el sistema responde siempre «Email o contraseña incorrectos.» sin revelar cuál de los casos se ha dado

#### Scenario: Datos incompletos
- **WHEN** se intenta entrar sin email o sin contraseña
- **THEN** el sistema pide los campos que faltan y no hace el intento

### Requirement: Freno a los intentos repetidos
El sistema MUST bloquear durante 15 minutos los intentos de inicio de sesión
tras 5 fallos para un mismo email, o tras 30 fallos desde un mismo origen de red.

#### Scenario: Quinto fallo consecutivo
- **WHEN** se han producido 5 intentos fallidos para un email en los últimos 15 minutos
- **THEN** los nuevos intentos para ese email se rechazan, aunque la contraseña sea correcta, indicando cuántos minutos faltan

#### Scenario: Éxito antes del límite
- **WHEN** una persona acierta antes de agotar los intentos
- **THEN** el contador de fallos de ese email vuelve a cero

### Requirement: Panel protegido
El panel y sus datos MUST ser inaccesibles sin una sesión válida, aunque se conozca la dirección exacta.

#### Scenario: Acceso directo sin sesión
- **WHEN** alguien sin sesión abre una pantalla del panel
- **THEN** vuelve a la portada con el acceso abierto, y tras identificarse llega a la pantalla que pidió

#### Scenario: Datos sin sesión
- **WHEN** se piden datos del panel sin sesión válida
- **THEN** el sistema los rechaza indicando que hay que iniciar sesión

#### Scenario: Web pública
- **WHEN** cualquiera abre la portada
- **THEN** la ve completa sin necesidad de sesión

### Requirement: Caducidad de la sesión
Una sesión MUST caducar tras 2 horas sin actividad y, en cualquier caso, a las 12 horas de iniciarse.
No existe la opción «mantener la sesión iniciada».

#### Scenario: Inactividad
- **WHEN** pasan 2 horas sin actividad en una sesión
- **THEN** la siguiente acción exige volver a identificarse

#### Scenario: Duración máxima
- **WHEN** una sesión cumple 12 horas desde que se inició, aunque haya tenido actividad
- **THEN** la siguiente acción exige volver a identificarse

### Requirement: Cierre de sesión
Cerrar sesión MUST invalidar la sesión de inmediato y borrar los datos del panel del navegador.

#### Scenario: Salir y volver atrás
- **WHEN** una persona cierra sesión y luego vuelve atrás en el navegador o reabre el panel
- **THEN** no ve datos del panel y se le pide identificarse

### Requirement: Contraseñas
Las contraseñas MUST tener al menos 12 caracteres y ser distintas del email.
Nunca se guardan ni se muestran en claro.

#### Scenario: Cambio de la propia contraseña
- **WHEN** una persona con sesión indica su contraseña actual y una nueva que cumple las reglas
- **THEN** la nueva contraseña queda guardada y el resto de sus sesiones abiertas se cierran

#### Scenario: Cambio rechazado
- **WHEN** la contraseña actual no es correcta o la nueva no cumple las reglas
- **THEN** el sistema rechaza el cambio y explica el motivo

### Requirement: Contraseña temporal
Las cuentas recién creadas o restablecidas MUST recibir una contraseña temporal,
y su titular MUST elegir una nueva antes de usar el panel.

#### Scenario: Primera entrada
- **WHEN** una persona entra con una contraseña temporal
- **THEN** solo puede elegir su nueva contraseña o cerrar sesión, y cualquier otra pantalla o dato del panel le exige hacerlo antes

#### Scenario: Contraseña elegida
- **WHEN** guarda una nueva contraseña válida
- **THEN** entra al panel con normalidad

### Requirement: Roles
Cada cuenta MUST tener un rol: superadministración, administración, profesorado o asistente.
Las secciones reservadas a administración MUST rechazar al profesorado.
Superadministración puede todo lo que puede administración y, además, es la única que accede al historial
(ver quién hizo qué, deshacer y volver a un punto) y a la importación de hojas de cálculo.
El asistente es la cuenta con la que la inteligencia artificial consulta y cambia datos a petición de la
junta: MUST tener los mismos permisos que administración (ni historial ni importación) y todo lo que hace
MUST quedar en el historial a su nombre, como el resto de cuentas.

#### Scenario: Asistente en el historial
- **WHEN** la cuenta de asistente intenta acceder al historial
- **THEN** el sistema se lo impide indicando que no tiene permiso

#### Scenario: Profesorado en una sección de administración
- **WHEN** una cuenta de profesorado intenta acceder a una sección reservada a administración
- **THEN** el sistema se lo impide indicando que no tiene permiso

### Requirement: Sección Usuarios
Superadministración MUST tener una sección «Usuarios», que nadie más ve, con todas las cuentas: nombre, email,
rol, estado (activa o desactivada, y si tiene contraseña temporal) y última conexión (último inicio de sesión
o actividad; «Nunca» si no ha entrado). Por defecto muestra las activas, con filtros Activos, Desactivados y
Todos. Desde ella MUST poder crear cuentas, restablecer contraseñas (se muestra una contraseña temporal una
sola vez y se cierran sus sesiones), desactivar y reactivar cuentas y cambiar su rol. Nadie MUST poder
desactivar su propia cuenta ni cambiar su propio rol. Cada acción queda en el historial.

#### Scenario: Restablecer una contraseña
- **WHEN** superadministración restablece la contraseña de una cuenta y lo confirma
- **THEN** ve una contraseña temporal para entregarla en persona, y esa persona tendrá que cambiarla al entrar

#### Scenario: Su propia cuenta
- **WHEN** superadministración intenta desactivarse o quitarse el rol
- **THEN** no puede: en su fila no aparece «Desactivar» ni el selector de rol, y la API lo rechaza

### Requirement: Gestión técnica de cuentas
Quien mantiene la aplicación MUST poder, mediante un procedimiento técnico:
dar de alta cuentas con rol y contraseña temporal, desactivarlas y reactivarlas,
cambiar su rol y restablecer su contraseña.

#### Scenario: Alta
- **WHEN** se da de alta una cuenta con un email nuevo
- **THEN** se muestra una única vez su contraseña temporal

#### Scenario: Email repetido
- **WHEN** se intenta dar de alta un email que ya tiene cuenta
- **THEN** el alta se rechaza indicando que ya existe

#### Scenario: Desactivación
- **WHEN** se desactiva una cuenta
- **THEN** sus sesiones abiertas dejan de funcionar en su siguiente acción y no puede volver a entrar hasta que se reactive

#### Scenario: Restablecimiento
- **WHEN** se restablece la contraseña de una cuenta
- **THEN** se muestra una nueva contraseña temporal y se cierran todas sus sesiones

### Requirement: Registro de eventos de seguridad
Los inicios y cierres de sesión, los cambios de contraseña y las operaciones de gestión de cuentas
MUST quedar registrados con su resultado y la cuenta afectada,
sin incluir nunca emails ni contraseñas.

#### Scenario: Intento fallido
- **WHEN** falla un inicio de sesión
- **THEN** queda registrado como fallido, con la cuenta si existe, y sin el email ni la contraseña
