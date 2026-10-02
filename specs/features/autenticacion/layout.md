# Layout — Autenticación

Fuente: diseño `GestionClub.dc.html`, con estos cambios:

- el modal de acceso pide email además de contraseña;
- el panel muestra las secciones como «Próximamente» hasta que existan.

## 1. Component Hierarchy

```
HomePage (/)
├── HomeHeader
│   ├── Marca: logo + «Club Ajedrez» / «Puerta Elvira»
│   └── Botón «Acceso administración» (icono candado)
├── Contenido de portada (existente)
└── LoginDialog (abierto con el botón o con ?acceso=1)
    ├── Franja superior bicolor (verde 3/4, negro 1/4)
    ├── Logo del club
    ├── Título «Acceso administración» + texto de ayuda
    ├── Alert de error (condicional)
    ├── Campo Email
    ├── Campo Contraseña
    ├── Botón «Entrar»
    └── Botón cerrar (icono X, «Cerrar»)

RequireSession (protege /panel/*)
└── PanelLayout
    ├── Escritorio: PanelSidebar
    │   ├── Marca: logo + «Puerta Elvira» / «Gestión»
    │   ├── Navegación (6 secciones, deshabilitadas, etiqueta «Próximamente» salvo Resumen)
    │   └── Pie: nombre de la persona · rol, temporada, botón «Cerrar sesión»
    ├── Móvil: PanelMobileHeader (logo, título de la pantalla, botón icono «Cerrar sesión»)
    ├── Contenido (Outlet)
    │   └── PanelHomePage: antetítulo «Octubre 2026 · temporada 2026/27», título «Resumen del club»,
    │       saludo «Hola, <nombre>» y aviso «Las secciones de gestión llegarán en las próximas entregas.»
    └── Móvil: PanelMobileNav (4 pestañas: Resumen, Alumnos, Cobrar, Horas; solo Resumen activa)

ChangePasswordPage (/panel/cambiar-contrasena, fuera del PanelLayout)
├── Logo + título «Elige tu contraseña» + texto explicativo
├── Alert de error (condicional)
├── Campo Contraseña actual (temporal)
├── Campo Nueva contraseña + reglas en vivo
├── Campo Repite la nueva contraseña
├── Botón «Guardar y entrar»
└── Enlace-botón «Cerrar sesión»
```

## 2. Field Map (Full Field Parity)

| Pantalla | Campo / acción | Etiqueta | Tipo | Obligatorio | Notas |
|---|---|---|---|---|---|
| Portada | Botón | «Acceso administración» | botón | — | Abre LoginDialog |
| LoginDialog | Texto de ayuda | «Entra con tu email y tu contraseña.» | texto | — | Sustituye a «Introduce la contraseña del club…» |
| LoginDialog | email | «Email» | email, `autocomplete=username` | sí | placeholder «nombre@ejemplo.com» |
| LoginDialog | password | «Contraseña» | password, `autocomplete=current-password` | sí | placeholder «••••••••» |
| LoginDialog | Enviar | «Entrar» (enviando: «Entrando…») | submit | — | Ancho completo |
| LoginDialog | Cerrar | «Cerrar» (aria) | botón icono | — | — |
| PanelSidebar | Secciones | Resumen, Alumnos, Clases, Profesores, Cobros y cuotas, Contabilidad | navegación | — | Iconos: layout-dashboard, users, calendar-days, graduation-cap, wallet, book-open |
| PanelSidebar | Persona | «<nombre completo>» + «Administración» o «Profesorado» | texto | — | — |
| PanelSidebar | Temporada | «Temporada 2026/27» | texto | — | — |
| Panel | Cerrar sesión | «Cerrar sesión» | botón (icono log-out) | — | En móvil, solo icono con aria-label |
| PanelMobileNav | Pestañas | Resumen, Alumnos, Cobrar, Horas | navegación | — | Iconos: layout-dashboard, users, wallet, clock |
| ChangePasswordPage | currentPassword | «Contraseña actual» | password, `autocomplete=current-password` | sí | Ayuda: «La temporal que te dieron o la que usas ahora.» |
| ChangePasswordPage | newPassword | «Nueva contraseña» | password, `autocomplete=new-password` | sí | Reglas: «Al menos 12 caracteres», «Distinta de tu email» |
| ChangePasswordPage | confirmPassword | «Repite la nueva contraseña» | password, `autocomplete=new-password` | sí | — |
| ChangePasswordPage | Enviar | «Guardar y entrar» (enviando: «Guardando…») | submit | — | — |
| ChangePasswordPage | Salir | «Cerrar sesión» | botón secundario | — | — |

## 3. Basic Interaction Intents

- «Acceso administración» → abre el diálogo de acceso.
- «Entrar» → intenta iniciar sesión.
- Una sección del panel marcada como «Próximamente» no navega.
- «Cerrar sesión» → termina la sesión y vuelve a la portada.
- «Guardar y entrar» → cambia la contraseña y entra al panel.

## 4. Accessibility Structure

- LoginDialog: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` apunta al título.
- Formularios con `<form>` y `<label>` asociados. Los errores van en `role="alert"`.
- La navegación del panel es un `<nav aria-label="Secciones">`.
  Las secciones no disponibles usan `aria-disabled="true"` y su etiqueta visible «Próximamente».
- La sección actual lleva `aria-current="page"`.
- Las reglas de contraseña son una lista asociada al campo mediante `aria-describedby`.
