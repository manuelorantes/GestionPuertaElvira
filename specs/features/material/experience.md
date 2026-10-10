# Experience — Material deportivo

- Por defecto se ven los pedidos abiertos (reservados, o pedidos sin pagar o sin entregar) de cualquier fecha; «Todos»
  y los filtros muestran también los cerrados.
- «Cobrar» abre «Registrar cobro» con el concepto «Material» y el pedido elegido; al guardar sale el recibo y el pedido
  pasa a «Pagado» solo.
- Los formularios validan antes de enviar (falta el alumno, el producto, una opción de lista, un precio válido…) y, si
  la API rechaza (p. ej. no queda stock de esa talla, opción en uso, precio con algo cobrado), el diálogo se queda abierto
  con el mensaje.
- Cada acción correcta muestra un aviso breve («Reserva apuntada», «Cobro de 45 € generado», «Entregado»…) y refresca
  los datos del club (cuotas, ficha, stock, margen).
- Sin productos, «Productos» invita a crear el primero; sin compras ni pedidos, «Stock y compras» lo explica.
- Las acciones de cada pedido que son solo un icono dicen lo que hacen al pasar por encima.
