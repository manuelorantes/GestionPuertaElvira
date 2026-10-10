# Material deportivo

Venta de material del club al alumnado (chándales, polos, camisetas, relojes, tableros…): productos definidos desde la
aplicación, pedidos de cada alumno con su cobro, compras al proveedor por lotes, stock y margen.
Está en «Cobros y cuotas», en la pestaña «Material deportivo» (después de «Cuotas»).
Solo administración (admin y superadmin) puede verlo y gestionarlo.
Decisión de diseño: [material deportivo como cobro](../../decisions/material-deportivo-como-cobro.md).

### Requirement: Productos con campos propios
Administración MUST poder crear y editar productos sin tocar el código. Cada producto tiene nombre, precio de venta por
defecto y los campos que se le quieran poner:

- de lista: una lista cerrada de opciones (p. ej. «Talla»: 8, 10, 12, S, M, L); al apuntar un pedido hay que elegir una;
- de texto: texto libre y opcional (p. ej. «Nombre a estampar»).

Un producto MUST poder retirarse (deja de ofrecerse para pedidos nuevos) y volver a ofrecerse. No se puede quitar un
campo de lista ni una opción que ya usan pedidos o compras.

#### Scenario: Nuevo producto
- **WHEN** administración crea «Chándal» a 45 € con «Talla» (8, 10, 12) y «Nombre a estampar»
- **THEN** puede apuntar pedidos de chándal eligiendo talla y, si quiere, el nombre

#### Scenario: Opción en uso
- **WHEN** hay un pedido de chándal de talla 10 y se intenta quitar esa talla
- **THEN** no se permite y se explica que hay pedidos o compras con esa opción

### Requirement: Pedidos de un alumno
Cada pedido MUST ser de un producto para un alumno, con cantidad y los valores de sus campos. Sus estados:

- **Reservado**: se apunta lo que necesita (talla, nombre…); no tiene precio ni cobro;
- **Pedido**: tiene precio (se propone el del producto × cantidad y se puede cambiar) y genera un cobro al alumno por
  ese importe;
- **Pagado**: su cobro está cubierto; pasa solo al registrar el cobro;
- **Cancelado**: se anula; si tenía cobro, se cancela lo pendiente como en las cuotas (lo cobrado se queda). Un pedido
  ya pagado entero no se cancela. Un pedido cancelado se puede reactivar y vuelve a deberse entero.

Aparte del estado, un pedido con precio MUST poder marcarse como **entregado** (con fecha), antes o después de pagarlo,
y deshacerse la entrega. La entrega descuenta del stock la variante del pedido (los valores de sus campos de lista) y
no se permite si no hay unidades suficientes: hay que registrar antes la compra. Al cancelar un pedido entregado se
elige si la unidad vuelve al stock.
El precio de un pedido MUST poder corregirse mientras no tenga nada cobrado. Los campos y la cantidad se pueden
corregir mientras no esté entregado ni cancelado.

#### Scenario: De reserva a pagado
- **WHEN** se reserva un chándal de talla 10 para un alumno, se pasa a pedido por 45 € y se registra el cobro
- **THEN** el alumno tuvo un cobro de 45 € que aparece en «Cuotas» y en su ficha, y el pedido queda pagado

#### Scenario: Entrega sin stock
- **WHEN** se intenta entregar un chándal de talla 10 y no queda ninguno de esa talla
- **THEN** no se permite y se pide registrar la compra antes

#### Scenario: Cancelar con parte cobrada
- **WHEN** un pedido de 45 € tiene 20 € cobrados y se cancela
- **THEN** se cancelan los 25 € pendientes y se conservan los 20 € cobrados

### Requirement: Cobro del material
El cobro de un pedido MUST comportarse como una cuota más: sale en «Cuotas» en el mes en que se pasó a pedido (y en los
siguientes mientras siga pendiente), con su producto como concepto; se cobra desde «Registrar cobro» (concepto
«Material») o desde el propio pedido, con recibo, factura bajo petición y descuento especial si se quiere. Lo cobrado de
un pedido solo cubre ese pedido. En Contabilidad estos cobros son ingresos de «Venta de material».
El cobro de material solo se cancela cancelando su pedido.

### Requirement: Listado de pedidos
Por defecto MUST verse los pedidos abiertos de cualquier fecha (reservados, pedidos sin pagar o sin entregar), con
filtro por estado, producto y temporada para ver también los cerrados.

### Requirement: Compras al proveedor y stock
Administración MUST poder registrar compras por lotes: un producto, la fecha, lo que costó el lote entero y cuántas
unidades de cada variante (p. ej. 5 de talla 8, 10 de talla 10 y 5 de talla 12 por 600 €). El coste por unidad del lote
es el total entre sus unidades. Una compra se puede corregir o borrar si no deja ninguna variante con stock negativo.
El stock de cada variante MUST ser lo comprado menos lo entregado (sin contar lo devuelto al stock al cancelar). Junto
al stock se ve lo que hay apuntado y aún sin entregar, y cuánto falta comprar.

#### Scenario: Qué pedir al proveedor
- **WHEN** hay 7 chándales de talla 10 reservados o pedidos sin entregar y quedan 4 en stock
- **THEN** la talla 10 indica que faltan 3

### Requirement: Margen
Por producto MUST verse: unidades compradas y lo gastado, coste medio por unidad (todo lo gastado entre todas las
unidades compradas), unidades vendidas (pedidos con precio sin cancelar), ingresos (lo que se debe de esos pedidos) y lo
ya cobrado, y el margen por unidad y total (ingresos menos el coste medio de las unidades vendidas). También los totales
de todos los productos: lo comprado frente a lo vendido.

#### Scenario: Margen de un lote
- **WHEN** se compran 20 chándales por 600 € y se venden 10 a 45 €
- **THEN** el coste medio es 30 €, los ingresos 450 €, el margen 15 € por unidad y 150 € en total

### Requirement: En la ficha del alumno
La ficha del alumno MUST mostrar una tarjeta «Material deportivo» con sus pedidos y su estado, y la de cobros un
resumen de todo lo que mueve en el club: total cobrado y pendiente, desglosado en cuotas, cuota de socio y material.
