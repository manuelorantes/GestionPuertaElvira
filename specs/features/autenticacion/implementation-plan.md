# Clean implementation plan — Autenticación

## Component Responsibilities

| Componente | Responsabilidad | No hace |
|---|---|---|
| `shared/ui/Button` | Variantes `primary`, `secondary`, `ghost`, `outline`; tamaños `md` (44) y `lg` (48); estado `busy` | Lógica de negocio |
| `shared/ui/TextField` | Etiqueta, input, ayuda y error asociados por id | Validar |
| `shared/ui/Dialog` | Superposición, foco atrapado, Esc, clic fuera y devolución del foco | Contenido de formulario |
| `shared/ui/Alert` | Mensaje con `role="alert"` y tono `danger` o `info` | — |
| `features/auth/LoginDialog` | Formulario de acceso, sobre `useLoginForm` | Navegar tras el login (lo decide la página) |
| `features/auth/RequireSession` | Carga, redirección a la portada sin sesión y redirección al cambio de contraseña | Pintar el panel |
| `pages/home/HomeHeader` | Marca y botón de acceso | — |
| `pages/panel/PanelLayout` | Composición escritorio y móvil, más el `Outlet` | Comprobar sesión |
| `pages/panel/PanelSidebar`, `PanelMobileHeader`, `PanelMobileNav` | Presentación de la navegación, con datos de `panelSections` | Estado |
| `pages/panel/PanelHomePage` | Contenido provisional del Resumen | — |
| `pages/panel/ChangePasswordPage` | Formulario de cambio obligatorio, sobre `useChangePasswordForm` | — |

## File Organisation

```
src/shared/api/client.ts          apiGet, apiSend, ApiError (añade retryAfterSeconds)
src/shared/ui/{Button,TextField,Dialog,Alert}.tsx (+ .test.tsx)
src/features/auth/
  api.ts                          tipos SessionUser y llamadas (fetchSession, login, logout, changePassword)
  useSession.ts                   consulta 'session' (null si 401) + clave exportada
  useLogin.ts · useLogout.ts · useChangePassword.ts   mutaciones que actualizan o limpian la caché
  useLoginForm.ts                 estado del formulario, validación y traducción de errores
  useChangePasswordForm.ts        estado, reglas en vivo, confirmación y errores
  passwordRules.ts                reglas puras (12 caracteres, distinta del email)
  apiErrorMessage.ts              ApiError → mensaje para la persona usuaria
  LoginDialog.tsx · RequireSession.tsx
src/pages/home/HomeHeader.tsx, HomePage.tsx (actualizada)
src/pages/panel/{PanelLayout,PanelSidebar,PanelMobileHeader,PanelMobileNav,PanelHomePage,ChangePasswordPage}.tsx
src/pages/panel/panelSections.ts  definición de secciones (etiqueta, icono, disponible)
src/app/App.tsx                   rutas + QueryClient con manejo global de 401
src/app/queryClient.ts            creación del QueryClient (también usada en tests)
```

## State Ownership

- **Servidor:** la consulta `['session']` es la única fuente del usuario actual.
  Login pone sus datos (`setQueryData`), logout vacía la caché (`clear()`)
  y el cambio de contraseña invalida la sesión.
- **URL:** `acceso=1` abre el diálogo, y `state.from` recuerda la ruta pedida para volver tras entrar.
- **Formularios:** `useState` local dentro de cada hook de formulario.
- **Derivados** (reglas cumplidas, puede enviarse): se calculan en el render, sin `useEffect`.

## Hook Extraction Plan

- `useSession`: lo usan `RequireSession`, `PanelLayout` y `HomeHeader`.
- `useLoginForm` y `useChangePasswordForm`: orquestan campos, validación, mutación y errores,
  para que los componentes solo pinten.
- `useLogout`: lo usan el sidebar y la cabecera móvil, sin duplicar la limpieza de caché ni la navegación.

## Rendering Structure

```tsx
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/panel" element={<RequireSession />}>
    <Route path="cambiar-contrasena" element={<ChangePasswordPage />} />
    <Route element={<PanelLayout />}>
      <Route index element={<PanelHomePage />} />
    </Route>
  </Route>
</Routes>
```

`RequireSession` renderiza `<Outlet />` solo con sesión.
El layout se divide con clases responsive de Tailwind (`md:`), no con JavaScript:
el sidebar es `hidden md:flex`, y la cabecera y la barra móviles son `md:hidden`.

## Form and Validation Structure

- `<form noValidate onSubmit>`, con validación propia en el hook y errores por campo vía `TextField.error`.
- Los errores de la API se muestran en `Alert` mediante `apiErrorMessage(error)`.

## Reuse of Local Primitives

- Iconos `lucide-react`, ya presentes en el proyecto.
- Los colores, radios y sombras salen exclusivamente de los tokens de `index.css`.
- La marca (logo con texto) se repite en la cabecera de la portada, el sidebar y el diálogo,
  así que se extrae a `shared/ui/ClubLogo` (imagen circular con tamaño por prop).

## Conditional Rendering Strategy

- Condiciones con nombre: `const isBlockedByAttempts = error?.code === 'too_many_requests'`.
- `RequireSession` usa retornos tempranos: cargando, luego sin sesión, luego obligado a cambiar la contraseña y estando fuera de esa ruta, y por último el `Outlet`.
- Las secciones del panel se pintan con `panelSections.map` y una sola rama según `available`.

## Anti-Cleanup Checklist

- [ ] Ningún componente mezcla carga de datos, formulario y maquetación: los hooks de formulario y sesión están separados.
- [ ] Ningún color hexadecimal ni sombra literal en los componentes.
- [ ] La limpieza de caché y la navegación al salir solo existen en `useLogout`.
- [ ] La traducción de errores solo existe en `apiErrorMessage`.
- [ ] La definición de secciones solo existe en `panelSections.ts`.
- [ ] No hay estado derivado guardado en `useState` ni efectos que sincronicen estado.
- [ ] Tests por comportamiento (rol, etiqueta y texto) de cada componente y hook relevante.
