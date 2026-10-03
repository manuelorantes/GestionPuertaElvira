# Facturas con adjunto en un almacenamiento de documentos

## Context
Las facturas de proveedores deben guardarse con su PDF o una foto (decisión del usuario). En local todo corre en Docker;
más adelante se desplegará en AWS. Los documentos no deben ir en el repositorio ni en la base de datos.

## Decision
- Puerto `Application\Accounting\Port\DocumentStorage` (`put`, `read`, `remove`) con claves generadas por la aplicación
  (`invoices/<factura>/<uuid>.<ext>`).
- Adaptador `LocalDocumentStorage` en `apps/api/var/storage/<entorno>` (ignorado por git). Al desplegar se añadirá un adaptador S3.
- Solo PDF, JPG, PNG o WEBP de hasta 10 MB; el tipo se detecta por el contenido (`finfo`), no por lo que declara el navegador.
  La descarga se sirve con su tipo, `Content-Disposition: inline` y `X-Content-Type-Options: nosniff`.
- La API sigue exigiendo JSON en las peticiones que cambian estado. Solo las dos rutas de subida admiten `multipart/form-data`,
  y entonces exigen la cabecera `X-Requested-With: fetch` (un formulario de otro sitio no puede enviarla), manteniendo la defensa CSRF.

## Consequences
- Las copias de seguridad deben incluir la carpeta de documentos (o el bucket) además de la base de datos.
- Cambiar a S3 no toca dominio ni casos de uso.
