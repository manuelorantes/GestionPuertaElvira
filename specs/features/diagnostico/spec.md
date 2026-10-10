# Diagnóstico de datos

Pestaña «Diagnóstico» de [Contabilidad](../contabilidad/spec.md): reglas que comprueban lo que no cuadra entre los datos
del club (cuotas, alumnos, familia, contabilidad, profesorado) y lo muestran explicado, con su solución, para aceptarlo
o descartarlo. Solo administración puede verlo y gestionarlo.
Decisión de diseño: [diagnóstico con reglas sobre hechos](../../decisions/diagnostico-con-reglas-sobre-hechos.md).

### Requirement: Ejecución del diagnóstico
El diagnóstico MUST poder lanzarse a mano con «Diagnosticar» y MUST ejecutarse solo cada noche, después del cierre
del club y después de crearse las cuotas del mes, con las mismas reglas. Ejecutarlo MUST NOT cambiar ningún dato del
club: solo crea, actualiza o cierra hallazgos. Su ejecución nocturna MUST quedar apuntada en la sección Sistema
(tarea «Diagnóstico de datos»). Dos diagnósticos no se ejecutan a la vez.

#### Scenario: Diagnosticar a mano
- **WHEN** administración pulsa «Diagnosticar»
- **THEN** se ejecutan todas las reglas sobre los datos de ese momento y la pestaña muestra el resultado, con la fecha,
  la hora y el nombre de quien lo lanzó

#### Scenario: Diagnóstico nocturno
- **WHEN** llega la hora de la tarea nocturna
- **THEN** se ejecuta el mismo diagnóstico a nombre de «Tarea nocturna» y los hallazgos nuevos quedan abiertos

### Requirement: Hallazgos
Cada hallazgo MUST indicar la regla, la entidad afectada (alumno, apunte, factura o profesor, con enlace a su ficha;
o recibos o el club entero, sin enlace), una explicación con los datos concretos y la solución propuesta. Cada
hallazgo MUST estar en uno de estos estados: abierto, aceptado, descartado o resuelto solo. Aceptado y descartado
guardan la fecha y el nombre de quien lo decidió.

Un hallazgo MUST tener una huella que lo identifica: la regla, la entidad y los datos que lo motivan. Dos
diagnósticos seguidos sin cambios MUST producir los mismos hallazgos, no duplicados. Al volver a diagnosticar:
- un hallazgo abierto que ya no se reproduce MUST pasar a «resuelto solo»;
- un hallazgo descartado cuya huella coincide MUST NOT volver a salir;
- si los datos del caso cambian (otro importe, otra situación), MUST ser un caso nuevo y salir aunque el anterior se
  hubiera descartado.

#### Scenario: Nada cambia entre dos diagnósticos
- **WHEN** se diagnostica dos veces sin tocar ningún dato
- **THEN** la segunda vez no hay hallazgos nuevos ni duplicados, y todos siguen abiertos

#### Scenario: Se arregla a mano
- **WHEN** administración corrige desde la ficha el dato que motivaba un hallazgo y vuelve a diagnosticar
- **THEN** el hallazgo pasa a «resuelto solo», sin nombre de quien lo cerró

#### Scenario: Descartado y cambia el importe
- **WHEN** se descarta la cuota de octubre de un alumno a 36 € frente a una tarifa de 49,50 € y después la cuota pasa
  a 37 €
- **THEN** sale un hallazgo nuevo con 37 €; el descartado sigue descartado

### Requirement: Aceptar y descartar
Un hallazgo abierto con arreglo automático MUST poder aceptarse, tras confirmar: se aplica exactamente la solución
propuesta, el cambio queda en el historial a nombre de quien aceptó y el hallazgo pasa a «aceptado». Antes de aplicar
el arreglo el sistema MUST volver a comprobar la regla: si el caso ya no se reproduce con los datos de ese momento, se
rechaza con un aviso y hay que volver a diagnosticar. Un hallazgo sin arreglo automático solo MUST ofrecer
«Descartar» y el enlace a la ficha. Cualquier hallazgo abierto MUST poder descartarse, tras confirmar. Un hallazgo
cerrado no se vuelve a aceptar ni a descartar.

#### Scenario: Aceptar un arreglo
- **WHEN** administración acepta «Cuota distinta de la tarifa» de Paula (36 € frente a 49,50 €)
- **THEN** la cuota pasa a 49,50 €, lo cobrado se reparte de nuevo, el historial recoge «Aceptar hallazgo» a su nombre
  y el hallazgo sale en «Aceptados»

#### Scenario: Los datos cambiaron
- **WHEN** administración acepta un hallazgo cuyo caso ha cambiado desde el diagnóstico
- **THEN** no se aplica nada y la pantalla avisa de que hay que volver a diagnosticar

### Requirement: Pantalla
La pestaña «Diagnóstico» MUST mostrar: el botón «Diagnosticar»; la fecha y hora del último diagnóstico, quién o qué
lo lanzó y el número de hallazgos abiertos (y los nuevos y resueltos solos de ese diagnóstico, si los hubo); un
selector de estado (Abiertos, Aceptados, Descartados, Resueltos solos); y la lista agrupada por gravedad (Dinero,
Datos del club y Forma, en ese orden) y dentro por regla, cada hallazgo con su entidad, explicación, propuesta y los
botones «Aceptar» (solo con arreglo) y «Descartar». Los hallazgos cerrados muestran cuándo y quién los cerró.

### Requirement: Reglas
Cada regla es una comprobación con nombre. «Arreglo» indica la solución automática si la hay; sin arreglo, el
hallazgo solo se puede descartar.

Dinero:
1. **Cuota distinta de la tarifa**: cuota mensual no fijada a mano, del mes en curso o de uno futuro, de un alumno
   activo con grupos, cuyo importe no es el que sale hoy de sus horas semanales (y sus clases particulares, si las tiene), su descuento
   familiar y el descuento por pago adelantado apuntado en la cuota (sumados sobre la tarifa base). Incluye las cuotas
   ya cobradas. La explicación muestra horas, tarifa, particulares, descuentos y los dos importes. Arreglo:
   ajustar la cuota al importe calculado (lo cobrado se reparte de nuevo; la diferencia queda pendiente o a favor).
2. **Gasto en una categoría genérica que tiene la suya**: apunte manual de gasto o factura en «Otros gastos» o
   «Suministros» cuyo concepto habla de limpieza, presidente, luz o electricidad, agua, internet, wifi, fibra o Digi,
   alquiler o comunidad, cuando el club tiene esa categoría. Arreglo: cambiar la categoría.
3. **Factura que puede duplicar un apunte manual**: factura con un apunte manual de gasto por el mismo importe o por
   un tercio (facturas trimestrales) cuyo mes al que corresponde es el mismo, el anterior o el siguiente. Sin arreglo.
4. **Gasto de «Profesores» que nombra a un profesor**: apunte manual de gasto en «Profesores» cuyo concepto nombra a un
   profesor (nombre completo, nombre y un apellido, o un nombre que solo tiene un profesor). Arreglo: convertirlo en un
   anticipo a ese profesor con la misma fecha e importe, a descontar de su primer mes de la temporada sin liquidar.
5. **Los cobros del mes no cuadran con el libro**, 6. **Lo cubierto no cuadra con lo cobrado**, 7. **Cuota con lo
   cubierto incoherente con su estado** y 8. **Horas y liquidación no cuadran** (liquidación pagada cuyas horas o
   importe difieren de las sesiones del mes): cuadres del propio sistema; sin arreglo.

Datos del club:
9. **Paga cuota sin estar en ningún grupo**: alumno activo sin grupos con cuotas mensuales del mes en curso o futuras.
10. **Pagó algún mes y ya no tiene grupo**: alumno activo sin grupos que pagó un mes anterior y no tiene cuota del mes
    en curso.
11. **Socio sin clases que nunca ha pagado**: alumno activo sin grupos, sin ningún cobro y con la cuota de socio
    pendiente. Un hallazgo por alumno.
12. **«En el grupo desde» después de haber pagado**: todos sus grupos empiezan después de un mes que tiene pagado.
    Arreglo: poner «En el grupo desde» en su fecha de alta en los grupos que empiezan después de ella.
13. **Posible familia sin vincular**: dos alumnos activos que comparten email de contacto o teléfono de un tutor, o
    tienen los mismos dos apellidos, y no son familia directa. Cada par sale una vez. Arreglo: vincularlos (sus cuotas
    se recalculan).
14. **Familia directa no mutua**: A tiene a B y B no tiene a A. Arreglo: completar la relación.
15. **Número de socio repetido**: sin arreglo.
16. **Ingresos atribuidos sin horas**: profesor con ingresos atribuidos en un mes pasado y sin horas ni liquidación.
17. **Puntos del mes que no cuadran** con la suma de sus movimientos: sin arreglo.

Forma:
18. **Adulto con su propio teléfono como tutor**: alumno de 18 años o más, sin teléfono propio, cuyo único tutor se
    llama como él y tiene teléfono. Arreglo: pasar el teléfono a propio y quitar el tutor.
19. **Nombre mal escrito**: palabras en minúscula (salvo partículas) o espacios de más. Arreglo: corregirlo.
20. **Recibos con huecos o repetidos** en la numeración de una temporada: sin arreglo.
21. **Recibos fechados antes que el anterior**: un único hallazgo con el número de casos (suele venir de la
    importación); si el número cambia, vuelve a salir. Sin arreglo.

#### Scenario: Dos hermanos sin vincular
- **WHEN** Irene y Mario comparten el email de contacto y no constan como familia directa
- **THEN** sale «Posible familia sin vincular» para ese par, con «Aceptar», y al aceptarlo quedan vinculados y sus
  cuotas se recalculan con el descuento familiar

#### Scenario: Apunte que no es un pago de más
- **WHEN** «Ángel, Seguridad Social» está en «Profesores» y nombra a Ángel
- **THEN** sale «Gasto de “Profesores” que nombra a un profesor»; administración lo descarta y no vuelve a salir

### Requirement: Acceso restringido
El diagnóstico MUST estar reservado a cuentas de administración; otros roles no pueden consultarlo, lanzarlo ni
decidir sobre sus hallazgos.
