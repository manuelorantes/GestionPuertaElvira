# Despliegue en AWS pendiente

**Estado:** propuesto. Por ahora el proyecto solo funciona en local.

## Context

Se quiere un entorno de staging y uno de producción.
Mientras tanto todo funciona en local con Docker.
La intención es desplegar más adelante en AWS, como otros proyectos de Aircury.

## Decision

Por ahora no hay despliegue.
Se preparan las piezas que no condicionan la elección:

- La etapa `prod` en `docker/php/Dockerfile`.
- API y web en el mismo origen.
- Configuración solo por variables de entorno.
- Las ramas `staging` y `main`, listas para disparar despliegues.

Opción de referencia para cuando se decida, por coherencia con Aircury:

- Web estática en S3 + CloudFront.
- API en Lambda con Bref o en contenedor.
- Aurora PostgreSQL Serverless v2.
- Secretos en SSM Parameter Store.
- Infraestructura con AWS CDK y despliegue desde GitHub Actions con OIDC.

## Consequences

- Cuando se aborde el despliegue, esta ADR se revisará con la decisión final.
- Hasta entonces, «staging» y «producción» son ramas, no entornos desplegados.
