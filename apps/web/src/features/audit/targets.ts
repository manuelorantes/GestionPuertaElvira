import { monthLabel } from '@/features/billing/money';

import type { AuditTarget } from './api';

/** Enlace al sitio de la aplicación donde se ve lo que tocó un cambio del historial. */
export function targetLink(target: AuditTarget): { to: string; label: string } {
  switch (target.kind) {
    case 'payment':
      return { to: `/panel/cobros?pestana=registro&recibo=${target.id}`, label: 'Ir al cobro' };
    case 'student':
      return { to: `/panel/alumnos/${target.id}`, label: 'Ir al alumno' };
    case 'group':
      return { to: `/panel/clases?grupo=${target.id}`, label: 'Ir al grupo' };
    case 'teacher':
      return { to: '/panel/clases?pestana=profesores', label: 'Ir a profesores' };
    case 'charges':
      return {
        to: `/panel/cobros?mes=${target.month}`,
        label: `Ir a las cuotas de ${monthLabel(target.month).toLowerCase()}`,
      };
    case 'ledger':
      return {
        to: `/panel/contabilidad?mes=${target.month}`,
        label: `Ir a los movimientos de ${monthLabel(target.month).toLowerCase()}`,
      };
    case 'settlement':
      return {
        to: `/panel/profesores?pestana=liquidacion&mes=${target.month}`,
        label: `Ir a la liquidación de ${monthLabel(target.month).toLowerCase()}`,
      };
    case 'hours':
      return {
        to: `/panel/profesores?pestana=horas&mes=${target.month}&profesor=${target.teacherId}`,
        label: 'Ir al registro de horas',
      };
    case 'invoices':
      return { to: '/panel/contabilidad?pestana=facturas', label: 'Ir a facturas' };
    case 'billing-settings':
      return { to: '/panel/cobros?pestana=tarifas', label: 'Ir a tarifas y ajustes' };
  }
}
