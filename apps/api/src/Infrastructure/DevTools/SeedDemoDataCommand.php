<?php

declare(strict_types=1);

namespace App\Infrastructure\DevTools;

use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\GroupInput;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Teachers\RegisterTeacher;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Attribute\Option;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\When;

/**
 * Datos de demostración FICTICIOS del diseño (profesorado y grupos) para desarrollo y tests.
 * Se crean a través de los casos de uso, así que respetan las mismas reglas que la aplicación.
 */
#[When(env: 'dev')]
#[When(env: 'test')]
#[AsCommand('app:dev:seed-demo', 'Crea profesorado y grupos de demostración (solo desarrollo)')]
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

    public function __construct(
        private RegisterTeacher $registerTeacher,
        private CreateClassGroup $createGroup,
        private ClassGroupRepository $groups,
        private Connection $connection,
    ) {
    }

    public function __invoke(
        SymfonyStyle $io,
        #[Option('Borra antes inscripciones, grupos y profesores locales (lo usa make e2e)')]
        bool $reset = false,
    ): int {
        if ($reset) {
            $this->connection->executeStatement('DELETE FROM classes_enrolment');
            $this->connection->executeStatement('DELETE FROM classes_group');
            $this->connection->executeStatement('DELETE FROM teachers_teacher');
        }

        if ([] !== $this->groups->all()) {
            $io->note('Ya hay grupos: no se crean datos de demostración.');

            return Command::SUCCESS;
        }

        $teacherIds = array_map(fn (string $name): string => ($this->registerTeacher)($name), self::TEACHERS);
        foreach (self::GROUPS as [$name, $level, $teacher, $days, $start, $end, $classroom, $capacity]) {
            ($this->createGroup)(new GroupInput($name, $level, $teacherIds[$teacher], $days, $start, $end, $classroom, $capacity));
        }

        $io->success(\sprintf('Creados %d profesores y %d grupos de demostración.', \count(self::TEACHERS), \count(self::GROUPS)));

        return Command::SUCCESS;
    }
}
