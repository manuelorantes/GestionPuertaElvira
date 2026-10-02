# Guía de estilo

## Overview

Estética «club de ajedrez clásico»: papel crema, verde tablero, tinta casi negra
y titulares condensados en mayúsculas.
Sobria, con densidad de información media-alta en el panel de administración.

## Sources analysed

- Proyecto de Claude Design «GestionClub», fichero `GestionClub.dc.html`
  (portada pública, panel de escritorio y panel móvil; tratamiento «sobrio»).
- `assets/logo.png` y `assets/foto-club.jpg`, copiados en `apps/web/public/img/`.
- Implementación: tokens en `apps/web/src/index.css` (`@theme` de Tailwind).

## Design tokens

### Colores

| Token (Tailwind) | Valor | Uso en el diseño |
|---|---|---|
| `paper` | `#F3ECD8` | Fondo general de la aplicación |
| `surface` | `#FFFDF7` | Tarjetas, inputs, filas |
| `surface-muted` | `#EFE7D2` | Fondos secundarios, chips, filas alternas |
| `surface-raised` | `#FBF8F0` | Texto o iconos sobre verde |
| `sand` | `#EADFC0` | Nivel «peques», mapa de calor bajo |
| `line` | `#E6DCC2` | Borde de tarjetas |
| `line-strong` | `#D9CFB4` | Borde de inputs y botones secundarios |
| `line-soft` | `#E2D8BF` | Separadores, cabecera |
| `line-muted` | `#B7AC8E` | Bordes discontinuos (particulares) |
| `ink` | `#1A1A17` | Texto principal |
| `ink-strong` | `#151513` | Titulares, fondos oscuros, chip activo |
| `ink-soft` | `#3D3A2F` | Texto de navegación inactiva |
| `ink-muted` | `#5C5748` | Texto secundario, etiquetas |
| `brand` | `#1D5C36` | Acciones primarias, enlaces, activo |
| `brand-strong` | `#134026` | Hover, texto sobre `brand-soft` |
| `brand-soft` | `#E3EBDD` | Navegación activa, nivel iniciación |
| `brand-tint` | `#B9CDB3` | Bordes verdes suaves |
| `success-bg` / `success-fg` | `#E3EBDD` / `#134026` | Estado «Pagado» |
| `warning-bg` / `warning-fg` | `#F5EACB` / `#6E4D0B` | Estado «Pendiente» |
| `danger-bg` / `danger-fg` | `#F6E3DC` / `#8C2F22` | Estado «Vencido», gastos |

### Tipografía

| Token | Familia | Uso |
|---|---|---|
| `font-sans` | Work Sans 400/500/600 | Texto base (15px / 1.5) |
| `font-display` | Barlow Condensed 500/600/700 | Titulares y cifras, en mayúsculas con tracking 0,04–0,12em |
| `font-serif` | Cinzel 500/600 | Acentos decorativos de la portada |

Tamaños observados: 11, 12, 13, 14 (el más usado), 15, 16, 18, 20, 22, 24, 26 y 28 px.

### Forma y elevación

| Token | Valor | Uso |
|---|---|---|
| `rounded-sm` | 8px | Botones, inputs, selects |
| `rounded-md` | 12px | Tarjetas, modales |
| `rounded-full` | 9999px | Badges de estado, avatares, chips de filtro |
| `shadow-card` | `0 1px 3px rgb(41 37 36 / .08)` | Tarjetas |
| `shadow-overlay` | `0 8px 24px rgb(41 37 36 / .14)` | Modales, toasts |

## Semantic usage rules

- Una sola acción primaria (`brand`) por zona; las secundarias son contorneadas (`line-strong`).
- Los estados de pago usan siempre la pareja `*-bg`/`*-fg`, nunca solo el color del texto.
- Los importes positivos van en `brand-strong` y los gastos en `ink` con un icono `danger-fg`.
- Los niveles de clase tienen color propio en el horario (iniciación, intermedio, avanzado, peques, adultos, particular).
  [pending analysis] Se convertirán en tokens con la especificación de Clases.

## Core UI primitives

[pending analysis] Se crearán en `apps/web/src/shared/ui/` con la primera funcionalidad que los use.
Medidas observadas en el diseño:

- **Botón primario:** alto 44 (36 en compacto), padding 0 20px, `rounded-sm`, `brand` / `surface-raised`, peso 600, 14px.
- **Botón secundario:** alto 44, borde 1px `line-strong`, fondo transparente, `ink`.
- **Botón de icono:** 40×40, transparente, `rounded-sm`.
- **Input / select:** alto 44, padding 0 12px, borde 1px `line-strong`, fondo `surface`, `rounded-sm`.
- **Pestañas:** alto 44, subrayado de 2px `brand` en la activa, texto `brand-strong` 600; inactiva `ink-muted` 500.
- **Badge de estado:** `rounded-full`, pareja de colores de estado, 12–13px, peso 600.
- **Tarjeta:** `surface`, borde 1px `line`, `rounded-md`, `shadow-card`.
- **Iconos:** Lucide, 18px (22px en la navegación móvil), trazo 2.

## Interaction states

- Hover de enlace o botón primario: `brand` → `brand-strong`.
- Elemento de navegación activo: fondo `brand-soft` y texto `brand-strong` (escritorio).
- Chip de filtro activo: fondo `ink-strong`, texto `paper`.
- Animaciones desactivadas con `prefers-reduced-motion`.
- [pending analysis] Foco visible, deshabilitado y carga.

## Composition patterns

- Escritorio: barra lateral de navegación, cabecera de sección (antetítulo + título + acción primaria) y contenido en tarjetas;
  máximo 1280px de ancho.
- Ficha lateral (alumno, clase) que se abre sobre la lista.
- Modales de hasta 460–520px para formularios (cobro, horas, factura, alumno, grupo).
- Móvil: barra inferior con 4 pestañas (Resumen, Alumnos, Cobrar, Horas).

## Responsive conventions

- Corte a móvil por debajo de 760px de ancho de contenedor.
- Margen lateral de 16px en móvil y de 48px en la cabecera de escritorio.

## Accessibility-related visual conventions

- Texto base de 15px; objetivos táctiles de al menos 40–44px.
- El estado nunca se comunica solo con color: el badge siempre lleva texto.
- [pending analysis] Contrastes AA de `ink-muted` sobre `paper`, y anillo de foco.

## Known gaps and inconsistencies

- El diseño usa estilos en línea; algunos tonos aparecen una sola vez
  (`#F7F2E4`, `#F1F5EC`, `#CFDCC8`, `#5C4A1C`) y no se han convertido en tokens hasta que haga falta.
- El diseño no define estados de foco ni de error de formulario.

## Strict reuse rules

- Prohibido usar colores hexadecimales en componentes: solo tokens de `index.css`.
- Antes de crear un primitivo, busca en `apps/web/src/shared/ui/`.
- Un token nuevo se añade a la vez en `index.css` y en esta guía.
