# Estado del sistema

Permite saber si la aplicación y sus dependencias están operativas,
y define cómo responde la API cuando algo falla.

### Requirement: Comprobación de salud
El sistema MUST exponer una comprobación pública que informe de si la API y la base de datos responden.

#### Scenario: Todo operativo
- **WHEN** se consulta la comprobación de salud y la base de datos responde
- **THEN** el sistema responde con éxito indicando estado «healthy» y base de datos «reachable»

#### Scenario: Base de datos caída
- **WHEN** se consulta la comprobación de salud y la base de datos no responde
- **THEN** el sistema responde «servicio no disponible» indicando estado «unhealthy» y base de datos «unreachable»

### Requirement: Indicador de conexión en la portada
La portada MUST mostrar el nombre y el logo del club y el estado de conexión con la API.

#### Scenario: API disponible
- **WHEN** una persona abre la portada y la comprobación de salud tiene éxito
- **THEN** ve el texto «API conectada»

#### Scenario: API no disponible
- **WHEN** una persona abre la portada y la comprobación de salud falla
- **THEN** ve el texto «API sin conexión»

#### Scenario: Comprobación en curso
- **WHEN** la comprobación de salud aún no ha respondido
- **THEN** ve el texto «Comprobando la API…»

### Requirement: Errores de la API uniformes
Toda respuesta de error de la API MUST tener la forma `{error: {code, message}}`,
con un mensaje en español apto para la persona usuaria y sin detalles internos.

#### Scenario: Ruta inexistente
- **WHEN** se pide una ruta de la API que no existe
- **THEN** el sistema responde 404 con el código «not_found» y el mensaje «Recurso no encontrado.»

#### Scenario: Método no permitido
- **WHEN** se usa un método no admitido en una ruta existente
- **THEN** el sistema responde 405 con el código «method_not_allowed»

#### Scenario: Error inesperado
- **WHEN** ocurre un error no previsto al atender una petición
- **THEN** el sistema responde 500 con el código «internal_error», sin revelar detalles, y registra el error internamente

### Requirement: Correlación de peticiones
Cada respuesta de la API MUST incluir un identificador de petición,
y los registros internos de esa petición MUST llevar el mismo identificador.

#### Scenario: Identificador en la respuesta
- **WHEN** se hace cualquier petición a la API
- **THEN** la respuesta incluye la cabecera `X-Request-Id` con un identificador único
