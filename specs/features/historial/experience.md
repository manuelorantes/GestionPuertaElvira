# Experience — Historial

## Acceso
Solo superadministración; administración es devuelta al resumen. La cuenta de asistente consulta la API pero no
tiene web.

## Flujos

1. **General.** Al entrar se carga la lista completa (50 por página, «Ver más» trae las anteriores). El Select
   «Persona» filtra en el servidor (`?persona=`). No hay filtro de periodo.
2. **Secciones.** Las pestañas cambian `?seccion=`; al volver a General se limpia la URL. El periodo
   (`?periodo=`) se conserva al cambiar de pestaña; sin él, «Hoy». Cada cambio de periodo o sección vuelve a
   pedir al servidor, que filtra por las tablas de la sección y por el instante en que empieza el periodo en
   Madrid.
3. **Alumnos.** Misma tabla que la general, con detalle desplegable, «Deshacer» y «Volver aquí» (confirmación en
   diálogo, toast al terminar, se refrescan los datos del club).
3b. **Asistencia y notas.** Una fila por clase y día, sin paginar; el periodo filtra por el día de la clase. Al
   abrir una fila se pide la asistencia del grupo en el mes de la clase (cuadro de Clases, con ese día resaltado) y
   se ven las notas actuales de la clase y la lista corta de lo que se hizo ese día. Deshacer y volver aquí
   funcionan igual que en la general; el detalle campo a campo se consulta en General.
4. **Pagos.** Tabla de cobros al estilo de los movimientos. Los cobros deshechos (una «Deshacer» o una «Vuelta
   atrás» que los borró) salen en negativo, en rojo, con la etiqueta de la acción bajo el concepto y sin enlace
   al recibo. La suma del pie la calcula el servidor sobre todo el periodo, aunque solo haya una página cargada.
   No hay deshacer ni volver aquí en esta sección: se hace desde General.

## Estados

- Cargando: «Cargando historial…» / «Cargando cobros…» / «Cargando clases…» / «Cargando detalle…».
- Error de la API: `Alert` con el mensaje.
- Vacío: mensaje según sección y periodo (ver layout).
- Ordenación: desde las cabeceras, sobre lo cargado; por defecto lo más reciente primero.
- Filtro por acción: desde el menú de la cabecera «Acción», en el servidor (todo el historial); mientras llega la
  respuesta sigue la tabla anterior con el menú abierto.
