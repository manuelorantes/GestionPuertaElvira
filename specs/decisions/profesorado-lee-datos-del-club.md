# El profesorado lee los datos del club

## Context
El profesorado informa a familias y a posibles alumnos nuevos: qué grupos hay, a qué hora y dónde quedan plazas. También
necesita a veces datos de cualquier alumno del club (un teléfono, si está al corriente de pago) sin pasar por
administración. Hasta ahora solo veía lo suyo (sus clases, sus grupos y sus pagos) y ningún dato de contacto.

## Decision
- **Por decisión del club**, el profesorado MUST poder consultar, de solo lectura, las secciones «Clases» (horario
  semanal, grupos con su ocupación, hoja del grupo y asistencia con sus comentarios) y «Alumnos» (lista y ficha completa
  de cualquier alumno: datos personales y de contacto, familia, cuotas y cobros con sus recibos, material, asistencia y
  comentarios). Son datos de menores; el club los comparte con su profesorado para su labor.
- La API tiene un nivel de acceso propio, **`clubReader`** (administración y profesorado), que solo se puede dar a rutas
  `GET` (la aplicación se niega a arrancar si una ruta de escritura lo usa). Se aplica a las consultas de grupos,
  alumnos, ficha (cuenta y cobros del alumno, sus pedidos de material, asistencia y comentarios) y asistencia y
  comentarios de un grupo. Todo lo demás sigue siendo `admin`.
- Siguen reservadas a administración: crear o cambiar cualquier dato, las tarifas y pagos del profesorado (la lista de
  profesores lleva su tarifa), los listados de Cobros (cuotas del mes, ajustes), Contabilidad, Puntos, márgenes del
  material, Resumen, Historial, Usuarios, Sistema e Importar.
- La web decide qué acciones mostrar con un único criterio (`useCanManageClub`: administración en su espacio). En el
  espacio de profesor no aparece ningún botón de gestión.

## Consequences
- Las consultas con `clubReader` las comparten administración y profesorado: **cualquier campo que se les añada lo verá
  también el profesorado**. Un dato que deba quedar solo para administración necesita su propia ruta `admin`.
- Se reemplaza la regla anterior de que el profesorado no veía datos de contacto (spec de profesorado y autenticación).
- Si algún día el club quiere acotar este acceso, el punto de corte es `clubReader` en la API y `useCanManageClub` en la
  web.
