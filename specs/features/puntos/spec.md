# Puntos

Los alumnos ganan puntos viniendo los viernes y con las fotos con la equipación oficial en los torneos, y los
canjean al cobrar. Administración y superadministración los gestionan en la sección «Puntos».

### Requirement: Los puntos valen solo en su mes
Cada punto ganado o gastado MUST quedar apuntado como un movimiento (fecha, alumno, puntos, tipo, concepto y quién lo
hizo): asistencia a un viernes, foto en un torneo, ajuste a mano o canje en un cobro. Los puntos MUST valer solo en el
mes en que se ganan: el saldo de un mes es lo ganado menos lo gastado ese mes, y el mes siguiente se empieza de cero.
El saldo de un mes nunca MUST quedar en negativo: no se puede quitar ni gastar lo que ya se gastó. Cada movimiento queda
en el historial.

#### Scenario: Puntos sin gastar
- **WHEN** un alumno gana 2 puntos en septiembre y no los gasta
- **THEN** en octubre empieza con 0 puntos, y los de septiembre siguen en su historial

### Requirement: Sección Puntos
Administración y superadministración MUST tener una sección «Puntos» (el profesorado no la ve), con un mes de la
temporada para elegir y estas pestañas:
- **Alumnos**: todos los alumnos de alta con su número de socio, sus puntos del mes, lo ganado y lo canjeado en la
  temporada; se ordena por nombre, número de socio o puntos y se busca por nombre. Al pinchar un alumno se ve su
  historial de la temporada. En el mes en curso, «Ajustar» suma o resta puntos con un motivo obligatorio.
- **Viernes**: los viernes del mes en columnas y todos los alumnos de alta (socios con o sin clase) en filas; marcar una
  casilla es un punto de ese mes y desmarcarla lo quita. Los viernes que aún no han llegado y los festivos no se pueden
  marcar. Se busca por nombre y se puede ver solo a los que vinieron.
- **Fotos de torneo**: la galería de las fotos del mes con la equipación oficial en los torneos (alumno, fecha y, si se
  indica, el torneo). «Añadir foto» busca al alumno por su nombre y le adjunta la foto (imagen JPEG, PNG o WebP de
  hasta 5 MB; el navegador la reduce antes de subirla); cada foto es 1 punto en el mes de la foto, que no puede ser
  de un día que aún no ha llegado. Una foto se puede quitar, y con ella su punto si no se ha gastado.
- **Movimientos**: todo lo del mes, filtrable por tipo (viernes, torneo, ajuste o canje).
- **Canjes**: lo que se puede conseguir con puntos (por ahora, 5 puntos = 5 % de una cuota mensual al cobrar) y los
  canjes del mes.

#### Scenario: Asistencia de un viernes
- **WHEN** administración marca que Natan vino el viernes 4 de septiembre
- **THEN** Natan gana 1 punto de septiembre, que sale en sus movimientos como «Viernes 04/09»

#### Scenario: Una foto de torneo
- **WHEN** administración busca a Alberto, le adjunta su foto del Open de Granada del 4 de octubre y la guarda
- **THEN** Alberto gana 1 punto de octubre y la foto sale en la galería de octubre

#### Scenario: Un viernes que ya se gastó
- **WHEN** administración desmarca un viernes de un alumno que ya gastó esos puntos ese mes
- **THEN** el sistema se lo impide: los puntos ya se han gastado

### Requirement: Los viernes no son las clases
La asistencia de los viernes para los puntos MUST ser independiente de las clases: no tiene nada que ver con pasar lista
ni con las clases que caigan en viernes.

#### Scenario: Una clase en viernes
- **WHEN** un alumno viene a su clase de los viernes y se pasa lista
- **THEN** no gana ningún punto por ello; solo cuenta si administración lo marca en la pestaña Viernes

### Requirement: Los puntos en la ficha y al cobrar
La ficha de un alumno (alumno o socio) MUST mostrar sus puntos del mes y un enlace a su historial en Puntos, sin poder
sumarlos ni restarlos ahí. Al registrar el cobro de una cuota se pueden canjear 5 puntos del mes del cobro.

#### Scenario: Canje al cobrar
- **WHEN** un alumno con 5 puntos de octubre paga su cuota de octubre canjeándolos
- **THEN** se le descuenta un 5 % de una cuota y en Puntos sale el canje (−5) con el recibo
