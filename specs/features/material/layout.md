# Layout — Material deportivo

Pestaña «Material deportivo» de «Cobros y cuotas» (`/panel/cobros?pestana=material`), sin diseño previo: sigue los
patrones de Cuotas (botones redondos para elegir la vista, tarjetas con listas, acciones solo con icono y su nombre al
pasar por encima).

## 1. Component Hierarchy

```
MaterialTab (?vista=pedidos|stock|margen|productos)
├── Botones «Pedidos · Stock y compras · Margen · Productos» + a la derecha la acción de la vista:
│   «Apuntar pedido» · «Registrar compra» · (ninguna) · «Nuevo producto»
├── OrdersView
│   ├── Filtros: «Abiertos | Todos» · Estado · Producto · Temporada
│   └── Lista: avatar + alumno · «2 × Chándal · Talla 10 · Nombre a estampar: Pepe» · «Apuntado el …» (+ nota) |
│       importe (o «Sin precio»; «Faltan X» si está pagado en parte) | badge Reservado/Pedido/Pagado/Cancelado
│       + badge «Entregado dd/mm/aaaa» | acciones:
│       - reservado: «Pasar a pedido» · ✎ Corregir · ⊘ Cancelar pedido
│       - pedido: «Cobrar» · «Entregar» · ✎ Corregir (sin entregar) · € Cambiar precio (sin nada cobrado) · ⊘ Cancelar
│       - pagado: «Entregar» (si falta) · ↶ Deshacer la entrega (si está entregado)
│       - cancelado: «Reactivar»
├── StockView
│   ├── Una tarjeta por producto: tabla Variante | Compradas | Entregadas | En stock | Apuntadas sin entregar |
│   │   Faltan por comprar (en rojo si > 0)
│   └── «Compras»: fecha · producto y unidades · reparto por variante y nota · coste del lote y €/unidad · ✎ · 🗑
├── MarginsView
│   ├── Tres tarjetas: Comprado (€ y unidades) · Vendido (€, unidades y cobrado) · Margen de lo vendido
│   └── Tabla por producto: Compradas | Gastado | Coste medio | Vendidas | Ingresos | Cobrado | Margen/unidad | Margen
│       + fila Total
└── ProductsView: nombre (+ badge «Retirado») · campos («Talla: 8, 10, 12 · Nombre a estampar (texto)») · precio · ✎

Diálogos
├── «Apuntar pedido» / «Corregir pedido»: Alumno (buscador) · Producto · un campo por cada campo del producto ·
│   Cantidad · Nota · interruptor «Ya con precio: pasa a pedido y genera el cobro» + Precio total
├── «Pasar a pedido» / «Cambiar precio»: Precio total (propuesto: precio del producto × cantidad)
├── «Entregar»: Día de la entrega
├── «Cancelar pedido»: lo que se cancela del cobro + interruptor «Lo ha devuelto: vuelve al stock» si estaba entregado
├── «Nuevo producto» / «Editar producto»: Nombre · Precio de venta · Campos (nombre, Lista/Texto, opciones separadas
│   por comas, quitar) · «Añadir campo» · interruptor «Se ofrece para pedidos nuevos» al editar
└── «Registrar compra» / «Corregir compra»: Producto · Fecha · Coste del lote entero · unidades por variante ·
    «N unidades · X € cada una» · Nota
```

## 2. En la ficha del alumno

Tarjeta «Material deportivo» tras «Cuotas y cobros»: sus pedidos (lo pedido, fecha y precio, badges y «Cobrar» si está
pedido), «Apuntar pedido» y el enlace «Ver en Material deportivo». En «Cuotas y cobros», la tabla «Total en el club»
(Cuotas · Cuota de socio · Material deportivo · Total, con Cobrado y Pendiente).
