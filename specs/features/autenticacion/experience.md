# Experience — Autenticación

## 1. User Flows & Navigation

1. **Entrar:** portada → «Acceso administración» → diálogo → email y contraseña → «Entrar».
   - Si la cuenta no tiene que cambiar la contraseña: va a `/panel` (Resumen).
   - Si tiene que cambiarla (`mustChangePassword`): va a `/panel/cambiar-contrasena`.
2. **Acceso directo sin sesión:** cualquier `/panel/*` sin sesión redirige a `/?acceso=1`,
   que abre el diálogo de acceso automáticamente.
   Tras entrar, vuelve a la ruta que se pidió si era del panel.
3. **Cambio obligatorio:** mientras la cuenta deba cambiar la contraseña,
   cualquier ruta del panel redirige a `/panel/cambiar-contrasena`.
   Tras guardar, va a `/panel`.
4. **Salir:** «Cerrar sesión» → llamada de cierre → se vacía toda la caché de datos → portada.
   El botón «Atrás» del navegador no muestra datos, porque la API responde `no-store`
   y el guardián vuelve a comprobar la sesión.
5. **Sesión caducada o revocada:** si cualquier petición recibe 401,
   se vacía la caché y se redirige a `/?acceso=1`.
6. **Ya con sesión en la portada:** «Acceso administración» lleva directamente a `/panel`, sin abrir el diálogo.

## 2. Interaction & Micro-interactions

- El diálogo pone el foco en el campo Email al abrirse.
  Se cierra con Esc, con el botón cerrar o pulsando fuera; al cerrarse, el foco vuelve al botón que lo abrió.
- Enter dentro del formulario lo envía.
- Durante el envío, el botón muestra «Entrando…» o «Guardando…», queda deshabilitado
  y no se permiten envíos dobles.
- Las reglas de la nueva contraseña se marcan como cumplidas (icono check y color de éxito) mientras se escribe.
- En las secciones «Próximamente», el puntero no cambia a mano y la etiqueta se ve atenuada.

## 3. State Management & Logic

| Estado | Dueño | Notas |
|---|---|---|
| Usuario de la sesión | consulta `session` (`GET /api/auth/me`) | 401 → `null` (no es un error). `staleTime` de 1 minuto. Fuente única de verdad |
| Diálogo abierto | parámetro de URL `acceso=1` en la portada | Permite abrirlo desde redirecciones |
| Campos de formulario | estado local de cada formulario | — |
| Envío / error | mutaciones de TanStack Query | — |

Validación en cliente (la API valida igualmente):

- Login: email y contraseña no vacíos. El formato del email no se valida en cliente, para no dar pistas distintas.
- Cambio de contraseña:
  - nueva contraseña de al menos 12 caracteres y distinta del email;
  - la confirmación debe coincidir («Las contraseñas no coinciden.»);
  - la contraseña actual no puede estar vacía.

Errores de la API mostrados en el `Alert` del formulario:

| Código | Mensaje |
|---|---|
| `invalid_credentials` | el mensaje de la API («Email o contraseña incorrectos.») |
| `too_many_requests` | «Demasiados intentos. Prueba de nuevo en N minutos.» (N a partir de `Retry-After`, redondeado hacia arriba) |
| `current_password_mismatch`, `weak_password` | el mensaje de la API |
| Error de red o 5xx | «No se ha podido conectar. Inténtalo de nuevo.» |

Al enviar de nuevo se borra el error anterior.

Comportamiento por rol: los roles `administrator` y `teacher` ven el mismo armazón en esta entrega.
El texto del rol muestra «Administración» o «Profesorado».

Mientras se comprueba la sesión, se muestra un indicador de carga a pantalla completa
(«Comprobando la sesión…») y no se ve ningún contenido protegido.

## 4. Accessibility Behavior

- El foco queda dentro del diálogo mientras está abierto (bucle Tab y Mayúsculas+Tab).
- Los errores se anuncian con `role="alert"`.
  Si el envío falla, el foco va al primer campo inválido o, si el error es general, al campo email o contraseña actual.
- Al llegar a la pantalla de cambio de contraseña, el foco se pone en su primer campo.
- Todos los objetivos táctiles miden al menos 44 px.
- La barra inferior móvil marca la pestaña activa también con `aria-current`, no solo con color.
