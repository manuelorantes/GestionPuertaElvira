# FRAMEWORK.local.md

Project-specific instructions, additions, and overrides for this repository.

This file is intentionally local to the project. Aircury AI Framework installs it as a starter file but never overwrites it during updates.

## Excepciones a FRAMEWORK.md

- **Idioma** ([ADR](specs/decisions/idioma-del-proyecto.md)):
  interfaz, `specs/`, ADRs y README en **español de España**.
  Código, identificadores, commits y títulos de PR en **inglés**.
  Esto prevalece sobre la regla de inglés británico para la interfaz y la documentación.
- **Fechas**: formato día/mes/año (`02/10/2026`), zona horaria `Europe/Madrid`.
  La regla de «día antes que mes» se cumple igual.
- **Moneda**: euros, mostrados como `1.234,50 €`; guardados como enteros en céntimos.

## Forma de trabajar

- Todo comando del proyecto pasa por `make` (`make help`). Nunca en el host.
- Ramas: cada cambio sale de `staging` y vuelve por PR; la release es un PR `staging → main`
  ([ADR](specs/decisions/flujo-de-ramas-staging-y-main.md)).
- `make ci` debe pasar en local antes de abrir un PR.
- El diseño de referencia es el proyecto de Claude Design «GestionClub» (`GestionClub.dc.html`).
  Sus tokens están en `specs/ui/style-guide.md` y en `apps/web/src/index.css`.
- Datos personales (menores, DNI, teléfonos): nunca en el repositorio, en logs ni en fixtures reales.
  Los datos de ejemplo son siempre ficticios.

## Glosario del dominio (español → código)

| Español | Código |
|---|---|
| Alumno / alumnado | `Student` / `Students` |
| Tutor (legal) | `Guardian` |
| Socio / cuota de socio | `Member` / `MembershipFee` |
| Grupo (de clase) | `ClassGroup` |
| Clase particular | `PrivateLesson` |
| Nivel (iniciación, intermedio, avanzado, peques, adultos) | `Level` (`Beginner`, `Intermediate`, `Advanced`, `Juniors`, `Adults`) |
| Aula | `Classroom` |
| Plaza / ocupación | `Seat` / `Occupancy` |
| Profesor / profesorado | `Teacher` / `Teachers` |
| Tarifa por hora del profesor | `HourlyRate` |
| Registro de horas | `TimesheetEntry` |
| Liquidación mensual | `MonthlySettlement` |
| Cuota (mensual, trimestral, semestral, anual) | `Fee` (`Monthly`, `Quarterly`, `HalfYearly`, `Annual`) |
| Modalidad (horas semanales) | `WeeklyHoursPlan` |
| Descuento familiar | `FamilyDiscount` |
| Pago anticipado | `PrepaymentDiscount` |
| Puntos / canje | `LoyaltyPoints` / `Redemption` |
| Prorrateo | `Proration` |
| Cobro / recibo | `Payment` / `Receipt` |
| Pendiente / pagado / vencido / baja | `Pending` / `Paid` / `Overdue` / `Withdrawn` |
| Factura de proveedor | `SupplierInvoice` |
| Movimiento contable | `LedgerEntry` |
| Cierre de temporada | `SeasonClosing` |
| Temporada (sep–jun) | `Season` |
| Licencia federativa | `FederationLicence` |
| Autorización de imagen | `ImageConsent` |
