# Web pública

Portada del club accesible sin sesión: presentación, precios y descuentos de la temporada y acceso a administración.

### Requirement: Presentación
La portada MUST mostrar el nombre del club, la temporada que se anuncia (desde julio, la que empieza en septiembre),
el lema, una descripción de las clases, una foto del club y el botón «Ver precios» que lleva a la sección de precios.

### Requirement: Precios publicados
Los precios MUST salir de los mismos ajustes con los que se cobra (Cobros → Tarifas y ajustes), sin sesión:

- cuota mensual por tramo de horas semanales, con cómo se reparten las clases;
- precio por hora de las clases particulares;
- cuota de socio;
- descuento familiar y descuentos por pago anticipado (trimestre, semestre, todo el año);
- reglas de los puntos (texto fijo del club: 1 punto por viernes, 1 por foto con la equipación, 5 puntos = 5 %).

#### Scenario: Cambiar una tarifa
- **WHEN** administración cambia el precio del tramo de 3 horas
- **THEN** la portada muestra el nuevo precio

### Requirement: Acceso
La portada MUST ofrecer «Acceso administración» y MUST NOT mostrar ningún dato personal.
