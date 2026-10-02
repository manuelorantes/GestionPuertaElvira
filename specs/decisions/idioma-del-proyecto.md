# Idioma del proyecto

## Context

El club es de Granada y todos sus usuarios hablan español.
La configuración por defecto de Aircury pide inglés británico
en la documentación y en los textos de interfaz.

## Decision

- **Interfaz, especificaciones (`specs/`), ADRs y README: español de España.**
  Fechas en formato día/mes/año, importes como `1.234,50 €`
  y zona horaria `Europe/Madrid`.
- **Código, nombres técnicos, commits y títulos de PR: inglés**,
  preferentemente británico, como pide Aircury.
  `FRAMEWORK.local.md` recoge un glosario español → inglés del dominio
  para que los nombres sean siempre los mismos.

## Consequences

- Esta decisión prevalece sobre la regla de inglés británico de `FRAMEWORK.md`
  para la interfaz y la documentación.
- Los mensajes de error de la API que pueden llegar a la persona usuaria van en español.
