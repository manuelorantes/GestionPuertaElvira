/** `?accion=` con el que la ficha se abre con «Dar de alta de nuevo» ya desplegado. */
export const REJOIN_ACTION = 'alta-de-nuevo';

/** `?cuota=<AAAA-MM>` con el que la ficha baja hasta la cuota de ese mes y la resalta. */
export const FEE_PARAM = 'cuota';

/** `?ficha=` con el que se abre la ficha de un alumno encima de la página en que se está. */
export const SHEET_PARAM = 'ficha';

/** La ficha de un alumno; con `rejoin`, con «Dar de alta de nuevo» abierto. */
export function studentPath(id: string, open?: 'rejoin'): string {
  return `/panel/alumnos/${id}${open === 'rejoin' ? `?accion=${REJOIN_ACTION}` : ''}`;
}
