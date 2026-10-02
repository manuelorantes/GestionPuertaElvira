<?php

declare(strict_types=1);

namespace App\Infrastructure\DevTools;

use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\GroupInput;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Students\LinkSiblings;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentInput;
use App\Application\Teachers\RegisterTeacher;
use Doctrine\DBAL\Connection;
use LogicException;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Attribute\Option;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\When;

/**
 * Datos de demostración FICTICIOS del diseño (profesorado, grupos y alumnos) para desarrollo y tests.
 * Se crean a través de los casos de uso, así que respetan las mismas reglas que la aplicación.
 */
#[When(env: 'dev')]
#[When(env: 'test')]
#[AsCommand('app:dev:seed-demo', 'Crea profesorado, grupos y alumnos de demostración (solo desarrollo)')]
final readonly class SeedDemoDataCommand
{
    private const array TEACHERS = [
        'p1' => 'Lucía Moreno Gil',
        'p2' => 'Carlos Ruiz Márquez',
        'p3' => 'Javier Ortega Sánchez',
        'p4' => 'Ana Belén Torres',
        'p5' => 'Miguel Á. Fernández',
    ];

    /** [nombre, nivel, profesor, días, inicio, fin, aula, plazas] */
    private const array GROUPS = [
        ['Iniciación A', 'beginner', 'p1', ['mon', 'wed'], '17:00', '18:00', 1, 12],
        ['Intermedio A', 'intermediate', 'p2', ['mon', 'wed'], '18:00', '19:30', 1, 12],
        ['Avanzado A', 'advanced', 'p3', ['mon', 'wed'], '19:30', '21:00', 1, 10],
        ['Iniciación C', 'beginner', 'p4', ['mon', 'wed'], '16:00', '17:00', 2, 12],
        ['Intermedio C', 'intermediate', 'p5', ['mon', 'wed'], '17:00', '18:30', 2, 12],
        ['Iniciación D', 'beginner', 'p1', ['mon', 'wed'], '18:30', '19:30', 2, 12],
        ['Iniciación B', 'beginner', 'p4', ['tue', 'thu'], '17:00', '18:00', 1, 12],
        ['Intermedio B', 'intermediate', 'p5', ['tue', 'thu'], '18:00', '19:30', 1, 12],
        ['Adultos I', 'adults', 'p2', ['tue'], '19:30', '21:00', 1, 12],
        ['Adultos II', 'adults', 'p5', ['thu'], '19:30', '21:00', 1, 12],
        ['Peques B', 'juniors', 'p1', ['tue'], '16:00', '17:00', 2, 10],
        ['Iniciación E', 'beginner', 'p2', ['tue', 'thu'], '17:00', '18:00', 2, 12],
        ['Avanzado B', 'advanced', 'p3', ['tue', 'thu'], '18:00', '19:30', 2, 10],
        ['Peques A', 'juniors', 'p1', ['fri'], '16:30', '17:30', 1, 10],
        ['Competición', 'advanced', 'p3', ['fri'], '17:30', '19:00', 1, 12],
        ['Jóvenes talentos', 'juniors', 'p4', ['fri'], '19:00', '20:00', 1, 10],
        ['Particular · jueves', 'private_lesson', 'p5', ['thu'], '19:30', '21:00', 2, 2],
        ['Particular · viernes', 'private_lesson', 'p3', ['fri'], '17:30', '19:00', 2, 2],
    ];

    /**
     * [clave, nombre, nacimiento, grupo, tutores [nombre, teléfono], teléfono propio, licencia, autorización de imagen]
     * Todos los datos son ficticios.
     */
    private const array STUDENTS = [
        ['a1', 'Martina López Herrera', '2014-03-12', 'Intermedio A', [['Rocío Herrera', '612481930'], ['Daniel López', '612773041']], null, 'AND-20417', true],
        ['a2', 'Pablo López Herrera', '2017-01-22', 'Iniciación A', [['Rocío Herrera', '612481930'], ['Daniel López', '612773041']], null, null, true],
        ['a3', 'Hugo Martín Castillo', '2012-05-08', 'Avanzado A', [['Pilar Castillo', '655210784'], ['Andrés Martín', '655901236']], null, 'AND-18832', true],
        ['a4', 'Sofía Ramírez Vílchez', '2016-02-15', 'Iniciación B', [['Antonio Ramírez', '644903215']], null, null, true],
        ['a5', 'Daniel Jiménez Molina', '2010-06-30', 'Competición', [['Mercedes Molina', '688135602']], null, 'AND-16205', true],
        ['a6', 'Carmen Ruiz Prieto', '2018-04-03', 'Peques A', [['Francisco Ruiz', '633704198'], ['Lucía Prieto', '633186420']], null, null, true],
        ['a7', 'Alba Ruiz Prieto', '2015-09-11', 'Iniciación B', [['Francisco Ruiz', '633704198'], ['Lucía Prieto', '633186420']], null, null, true],
        ['a8', 'Javier Navarro Pérez', '1984-07-19', 'Adultos I', [], '677528810', null, true],
        ['a9', 'Irene Moreno Salas', '2013-03-27', 'Intermedio B', [['Inmaculada Salas', '622347561']], null, null, false],
        ['a10', 'Mateo Cano Robles', '2019-05-02', 'Peques B', [['José Cano', '699052347']], null, null, true],
        ['a11', 'Lucas García Medina', '2011-02-14', 'Avanzado B', [['Teresa Medina', '611874026']], null, 'AND-17940', true],
        ['a12', 'Elena Torres Aguilar', '2014-08-21', 'Intermedio C', [['Manuel Torres', '650661293']], null, null, true],
        ['a13', 'Adrián Sáez Romero', '2016-06-09', 'Iniciación C', [['Encarna Romero', '628410955']], null, null, false],
        ['a14', 'Nerea Villar Campos', '2012-01-30', 'Jóvenes talentos', [['Luis Villar', '666382071']], null, 'AND-19358', true],
        ['a15', 'Rubén Castro Linares', '2009-04-17', 'Particular · viernes', [['Elena Linares', '645179203']], null, 'AND-15876', true],
        ['a16', 'Clara Ibáñez Soto', '1988-03-05', 'Particular · jueves', [], '691224870', null, true],
    ];

    private const array SIBLINGS = [['a1', 'a2'], ['a6', 'a7']];

    public function __construct(
        private RegisterTeacher $registerTeacher,
        private CreateClassGroup $createGroup,
        private ClassGroupRepository $groups,
        private RegisterStudent $registerStudent,
        private LinkSiblings $linkSiblings,
        private Connection $connection,
    ) {
    }

    public function __invoke(
        SymfonyStyle $io,
        #[Option('Borra antes alumnos, inscripciones, grupos y profesores locales (lo usa make e2e)')]
        bool $reset = false,
    ): int {
        if ($reset) {
            $this->connection->executeStatement('DELETE FROM classes_enrolment');
            $this->connection->executeStatement('DELETE FROM students_student');
            $this->connection->executeStatement('DELETE FROM classes_group');
            $this->connection->executeStatement('DELETE FROM teachers_teacher');
        }

        if ([] !== $this->groups->all()) {
            $io->note('Ya hay grupos: no se crean datos de demostración.');

            return Command::SUCCESS;
        }

        $teacherIds = array_map(fn (string $name): string => ($this->registerTeacher)($name), self::TEACHERS);
        $groupIds = [];
        foreach (self::GROUPS as [$name, $level, $teacher, $days, $start, $end, $classroom, $capacity]) {
            $groupIds[$name] = ($this->createGroup)(new GroupInput($name, $level, $teacherIds[$teacher], $days, $start, $end, $classroom, $capacity));
        }

        $studentIds = [];
        foreach (self::STUDENTS as [$key, $name, $birthDate, $group, $guardians, $ownPhone, $licence, $imageConsent]) {
            $email = strtolower(strtr(explode(' ', $guardians[0][0] ?? $name)[0], ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u'])).'@ejemplo.com';
            $input = new StudentInput($name, $birthDate, null, $email, array_map(static fn (array $g): array => ['name' => $g[0], 'phone' => $g[1]], $guardians), $ownPhone, $licence, $imageConsent);
            $studentIds[$key] = ($this->registerStudent)($input, [$groupIds[$group] ?? throw new LogicException("Grupo de demostración desconocido: {$group}")], [], false);
        }
        foreach (self::SIBLINGS as [$a, $b]) {
            ($this->linkSiblings)($studentIds[$a] ?? throw new LogicException($a), $studentIds[$b] ?? throw new LogicException($b));
        }

        $io->success(\sprintf('Creados %d profesores, %d grupos y %d alumnos de demostración.', \count(self::TEACHERS), \count(self::GROUPS), \count(self::STUDENTS)));

        return Command::SUCCESS;
    }
}
