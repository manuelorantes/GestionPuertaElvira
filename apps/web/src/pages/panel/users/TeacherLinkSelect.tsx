import { useTeachers } from '@/features/classes/hooks';

const UNLINKED = '';

/** Profesor al que corresponde una cuenta de profesorado («Sin vincular» = ninguno). */
export function TeacherLinkSelect({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  disabled?: boolean;
  onChange: (teacherId: string | null) => void;
}) {
  const teachers = useTeachers().data ?? [];
  const options = teachers.filter((t) => t.active || t.id === value);
  return (
    <select
      aria-label={label}
      value={value ?? UNLINKED}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === UNLINKED ? null : e.target.value)}
      className="h-9 w-full rounded-sm border border-line-strong bg-surface px-2 text-sm"
    >
      <option value={UNLINKED}>Sin vincular</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.fullName}
        </option>
      ))}
    </select>
  );
}
