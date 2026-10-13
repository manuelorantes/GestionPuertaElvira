import type { AuditReferenceKind, AuditTarget } from '../../application/audit/mod.ts';

/** Columnas internas que no aportan nada a quien lee el historial. */
const HIDDEN = new Set([
  'id',
  'search_name',
  'created_at',
  'updated_at',
  'taken_at',
  'written_at',
  'password_changed_at',
  'teacher_linked_at',
  'attachment_key',
  'document_key',
  'variant_key',
  'field_values',
  'custom_name',
]);

/** Columnas que guardan el identificador de otro registro, y de qué clase es. */
const REFERENCES: Record<string, AuditReferenceKind> = {
  student_id: 'student',
  sibling_ids: 'student',
  teacher_id: 'teacher',
  taken_by_teacher: 'teacher',
  written_by_teacher: 'teacher',
  group_id: 'group',
  class_group_id: 'group',
  user_id: 'user',
  taken_by_user: 'user',
  written_by_user: 'user',
  created_by: 'user',
  paid_by: 'payment',
  payment_id: 'payment',
  charge_id: 'charge',
  product_id: 'product',
  duty_id: 'duty',
};

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export type AuditRow = Record<string, unknown>;

export function isHiddenField(field: string): boolean {
  return HIDDEN.has(field);
}

/** Los registros a los que apunta una fila (por sus columnas de identificador). */
export function referencesOf(row: AuditRow): { kind: AuditReferenceKind; id: string }[] {
  const found: { kind: AuditReferenceKind; id: string }[] = [];
  for (const [field, value] of Object.entries(row)) {
    const kind = REFERENCES[field];
    if (kind === undefined) continue;
    for (const id of Array.isArray(value) ? value : [value]) {
      if (typeof id === 'string' && id !== '') found.push({ kind, id });
    }
  }
  return found;
}

export function referenceTarget(
  kind: AuditReferenceKind,
  id: string,
  row: AuditRow,
): AuditTarget | null {
  switch (kind) {
    case 'student':
      return { kind: 'student', id };
    case 'teacher':
      return { kind: 'teacher', id };
    case 'group':
      return { kind: 'group', id };
    case 'payment':
      return { kind: 'payment', id };
    case 'charge': {
      const month = text(row, 'period')?.slice(0, 7);
      return month ? { kind: 'charges', month } : null;
    }
    case 'order':
      return text(row, 'student_id')
        ? { kind: 'student', id: text(row, 'student_id') ?? '' }
        : null;
    default:
      return null;
  }
}

function text(row: AuditRow, field: string): string | null {
  const value = row[field];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** «13/10/2026». */
export function dateLabel(iso: string | null): string | null {
  if (iso === null) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** «octubre 2026». */
export function monthLabel(month: string | null): string | null {
  if (month === null) return null;
  const [y, m] = month.slice(0, 7).split('-');
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

const CHARGE_KIND: Record<string, string> = {
  monthly: 'Cuota',
  membership: 'Cuota de socio',
  material: 'Cuota de material',
};

/**
 * Cómo se llama lo que tocó un cambio, para leerlo sin identificadores: el recibo y el alumno de un cobro, el
 * alumno y el grupo de una inscripción, el profesor y la fecha de una sesión… `name` resuelve los registros
 * referenciados; null si no hay nada mejor que la etiqueta de la tabla.
 */
export function titleOf(
  table: string,
  row: AuditRow,
  name: (kind: AuditReferenceKind, id: string) => string | null,
): string | null {
  const ref = (kind: AuditReferenceKind, field: string) => {
    const id = text(row, field);
    return id === null ? null : name(kind, id);
  };
  const join = (...parts: (string | null)[]) => {
    const present = parts.filter((p): p is string => p !== null && p !== '');
    return present.length === 0 ? null : present.join(' · ');
  };
  const student = () => ref('student', 'student_id');
  const teacher = () => ref('teacher', 'teacher_id');
  const group = () => ref('group', 'group_id') ?? ref('group', 'class_group_id');
  switch (table) {
    case 'students_student':
    case 'teachers_teacher':
      return text(row, 'full_name');
    case 'identity_user':
      return join(text(row, 'full_name'), text(row, 'email'));
    case 'classes_group':
    case 'equipment_product':
    case 'accounting_category':
      return text(row, 'name') ?? text(row, 'label');
    case 'billing_payment':
      return join(text(row, 'receipt_number'), student());
    case 'billing_charge':
      return join(
        `${CHARGE_KIND[text(row, 'kind') ?? ''] ?? 'Cuota'} de ${monthLabel(text(row, 'period'))}`,
        student(),
      );
    case 'billing_account':
    case 'students_past_membership':
    case 'points_photo':
      return join(student(), dateLabel(text(row, 'taken_on')));
    case 'points_movement':
      return join(student(), dateLabel(text(row, 'movement_date')));
    case 'classes_enrolment':
      return join(student(), group());
    case 'equipment_order':
      return join(ref('product', 'product_id'), text(row, 'variant_label'), student());
    case 'equipment_purchase':
      return join(ref('product', 'product_id'), dateLabel(text(row, 'bought_on')));
    case 'payroll_session':
      return join(teacher(), dateLabel(text(row, 'session_date')), text(row, 'label'));
    case 'payroll_settlement':
    case 'payroll_advance':
      return join(teacher(), monthLabel(text(row, 'month')));
    case 'payroll_duty':
      return join(text(row, 'label'), teacher());
    case 'payroll_substitution':
      return join(
        group() ?? ref('duty', 'duty_id'),
        dateLabel(text(row, 'substitution_date')),
        teacher(),
      );
    case 'payroll_holiday':
      return join(text(row, 'name'), dateLabel(text(row, 'holiday_date')));
    case 'payroll_proposed_month':
      return monthLabel(text(row, 'month'));
    case 'accounting_entry':
      return join(text(row, 'concept'), dateLabel(text(row, 'entry_date')));
    case 'accounting_invoice':
      return join(text(row, 'number'), text(row, 'supplier'));
    case 'accounting_closing': {
      const year = row.start_year;
      return typeof year === 'number'
        ? `Temporada ${year}/${String((year + 1) % 100).padStart(2, '0')}`
        : null;
    }
    case 'billing_document_sequence':
      return join(
        text(row, 'prefix'),
        typeof row.season_year === 'number' ? String(row.season_year) : null,
      );
    case 'attendance_roll_call':
    case 'attendance_absence':
    case 'attendance_guest':
      return join(group(), dateLabel(text(row, 'roll_date')), student());
    case 'attendance_comment':
      return join(group(), dateLabel(text(row, 'class_date')), student());
    case 'attendance_activity_check':
      return join(ref('duty', 'duty_id'), dateLabel(text(row, 'check_date')));
    default:
      return null;
  }
}
