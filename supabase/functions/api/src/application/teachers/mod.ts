import { FullName, type HasErrorDetails, Money } from '../../domain/common/mod.ts';
import { Teacher, TeacherId } from '../../domain/teachers/mod.ts';

export interface TeacherRepository {
  find(id: TeacherId): Promise<Teacher | null>;
  save(teacher: Teacher): Promise<void>;
}

export interface TeacherSummary {
  id: string;
  fullName: string;
  active: boolean;
  groupCount: number;
  /** Tarifa por hora con dos decimales («18.00»). */
  hourlyRate: string;
}

export interface TeacherQuery {
  /** Ordenados por nombre. */
  all(): Promise<TeacherSummary[]>;
}

/** Cuántos grupos tiene asignados un profesor (lo responde el contexto de Clases). */
export interface TeacherAssignments {
  groupCount(teacherId: TeacherId): Promise<number>;
}

export class TeacherNotFound extends Error {
  constructor() {
    super('No existe ese profesor.');
    this.name = 'TeacherNotFound';
  }
}

export class TeacherHasGroups extends Error implements HasErrorDetails {
  constructor(private readonly groupCount: number) {
    super(
      `No se puede desactivar: tiene ${groupCount} ${
        groupCount === 1 ? 'grupo' : 'grupos'
      } asignados. Asígnalos antes a otro profesor.`,
    );
    this.name = 'TeacherHasGroups';
  }

  details(): Record<string, number> {
    return { groupCount: this.groupCount };
  }
}

async function lookUp(teachers: TeacherRepository, id: string): Promise<Teacher> {
  const teacher = await teachers.find(TeacherId.fromString(id));
  if (teacher === null) throw new TeacherNotFound();
  return teacher;
}

export class RegisterTeacher {
  constructor(private readonly teachers: TeacherRepository) {}

  async execute(fullName: string): Promise<string> {
    const teacher = Teacher.register(TeacherId.generate(), FullName.fromString(fullName));
    await this.teachers.save(teacher);
    return teacher.id.value;
  }
}

export class RenameTeacher {
  constructor(private readonly teachers: TeacherRepository) {}

  async execute(id: string, fullName: string): Promise<void> {
    const teacher = await lookUp(this.teachers, id);
    teacher.rename(FullName.fromString(fullName));
    await this.teachers.save(teacher);
  }
}

export class ChangeTeacherRate {
  constructor(private readonly teachers: TeacherRepository) {}

  async execute(id: string, hourlyRate: string): Promise<void> {
    const teacher = await lookUp(this.teachers, id);
    teacher.changeRate(Money.fromDecimal(hourlyRate));
    await this.teachers.save(teacher);
  }
}

export class ActivateTeacher {
  constructor(private readonly teachers: TeacherRepository) {}

  async execute(id: string): Promise<void> {
    const teacher = await lookUp(this.teachers, id);
    teacher.activate();
    await this.teachers.save(teacher);
  }
}

export class DeactivateTeacher {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly assignments: TeacherAssignments,
  ) {}

  /** @throws TeacherHasGroups */
  async execute(id: string): Promise<void> {
    const teacher = await lookUp(this.teachers, id);
    const groups = await this.assignments.groupCount(teacher.id);
    if (groups > 0) throw new TeacherHasGroups(groups);
    teacher.deactivate();
    await this.teachers.save(teacher);
  }
}
