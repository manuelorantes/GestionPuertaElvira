<?php

declare(strict_types=1);

namespace App\Infrastructure\DevTools;

use App\Application\Accounting\EntryInput;
use App\Application\Accounting\InvoiceInput;
use App\Application\Accounting\PayInvoice;
use App\Application\Accounting\RecordEntry;
use App\Application\Accounting\RegisterInvoice;
use App\Application\Billing\AdjustPoints;
use App\Application\Billing\GenerateMonthlyCharges;
use App\Application\Billing\IssueInvoice;
use App\Application\Billing\PaymentRequest;
use App\Application\Billing\RegisterPayment;
use App\Application\Billing\UpdateStudentAccount;
use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\GroupInput;
use App\Application\Classes\Port\ClassGroupRepository;
use App\Application\Payroll\PaySettlement;
use App\Application\Payroll\ProposeMonthSessions;
use App\Application\Students\LinkSiblings;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentInput;
use App\Application\Teachers\ChangeTeacherRate;
use App\Application\Teachers\RegisterTeacher;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;
use LogicException;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Attribute\Option;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\When;

/**
 * Datos de demostración FICTICIOS del diseño (profesorado, grupos, alumnos y cobros) para desarrollo y tests.
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

    /** Facturas del diseño: [día, mes relativo (0 actual, -1 anterior), nº, proveedor, concepto, categoría, importe, pagada]. */
    private const array INVOICES = [
        [1, 0, 'R-ALQ', 'Propietario del local', 'Alquiler del mes', 'rent', '950', true],
        [1, 0, 'FAA-3381', 'Federación Andaluza de Ajedrez', 'Licencias federativas (12)', 'federation', '144', true],
        [2, 0, 'E-0912', 'Escaque Material Didáctico', 'Tablero mural de demostración', 'material', '86', true],
        [28, -1, 'E-0897', 'Escaque Material Didáctico', 'Relojes digitales (4)', 'material', '186', true],
        [25, -1, 'TP-044', 'Organización torneo provincial', 'Inscripción por equipos', 'tournaments', '120', false],
        [22, -1, 'S-55120', 'Compañía de suministros', 'Luz y agua', 'utilities', '86,40', true],
        [1, -1, 'R-ALQ', 'Propietario del local', 'Alquiler del mes', 'rent', '950', true],
    ];

    /** Tarifa por hora del diseño. */
    private const array RATES = ['p1' => '16', 'p2' => '18', 'p3' => '20', 'p4' => '15', 'p5' => '17'];

    /** Profesor con la liquidación del mes anterior aún pendiente. */
    private const string UNPAID_TEACHER = 'p5';

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

    /** [alumno, forma de pago preferida, socio, precio pactado de particulares, puntos] */
    private const array ACCOUNTS = [
        ['a1', 'three_months', true, null, 0],
        ['a3', 'monthly', true, null, 3],
        ['a5', 'six_months', true, null, 5],
        ['a8', 'monthly', true, null, 0],
        ['a15', 'monthly', false, '35', 0],
    ];

    /** Quien no ha pagado los meses anteriores (para ver cuotas vencidas). */
    private const array OVERDUE = ['a9', 'a13'];

    /** Quien ya ha pagado el mes actual, y cuántos meses de una vez. */
    private const array PAID_THIS_MONTH = ['a1' => 3, 'a3' => 1, 'a5' => 1, 'a6' => 1, 'a7' => 1, 'a8' => 1, 'a11' => 1, 'a14' => 1];

    /** Cuotas de socio ya pagadas. */
    private const array MEMBERSHIP_PAID = ['a1', 'a3', 'a5'];

    public function __construct(
        private RegisterTeacher $registerTeacher,
        private CreateClassGroup $createGroup,
        private ClassGroupRepository $groups,
        private RegisterStudent $registerStudent,
        private LinkSiblings $linkSiblings,
        private Connection $connection,
        private UpdateStudentAccount $updateAccount,
        private AdjustPoints $adjustPoints,
        private GenerateMonthlyCharges $generateCharges,
        private RegisterPayment $registerPayment,
        private IssueInvoice $issueInvoice,
        private Clock $clock,
        private ChangeTeacherRate $changeRate,
        private ProposeMonthSessions $proposeSessions,
        private PaySettlement $paySettlement,
        private EntityManagerInterface $em,
        private RegisterInvoice $registerInvoice,
        private PayInvoice $payInvoice,
        private RecordEntry $recordEntry,
    ) {
    }

    public function __invoke(
        SymfonyStyle $io,
        #[Option('Borra antes alumnos, inscripciones, grupos y profesores locales (lo usa make e2e)')]
        bool $reset = false,
    ): int {
        if ($reset) {
            foreach (['accounting_entry', 'accounting_invoice', 'accounting_closing', 'payroll_session', 'payroll_settlement', 'payroll_proposed_month', 'billing_charge', 'billing_payment', 'billing_account', 'billing_settings', 'billing_document_sequence'] as $table) {
                $this->connection->executeStatement("DELETE FROM {$table}");
            }
            $this->connection->executeStatement('DELETE FROM classes_enrolment');
            $this->connection->executeStatement('DELETE FROM students_student');
            $this->connection->executeStatement('DELETE FROM classes_group');
            $this->connection->executeStatement('DELETE FROM teachers_teacher');
            // El historial de los datos borrados ya no se puede restaurar: se empieza de cero.
            $this->connection->executeStatement('DELETE FROM audit_change');
            $this->connection->executeStatement('DELETE FROM audit_action');
            $this->em->clear();
        }

        if ([] !== $this->groups->all()) {
            $io->note('Ya hay grupos: no se crean datos de demostración.');

            return Command::SUCCESS;
        }

        $teacherIds = array_map(fn (string $name): string => ($this->registerTeacher)($name), self::TEACHERS);
        foreach (self::RATES as $key => $rate) {
            ($this->changeRate)($teacherIds[$key], $rate);
        }
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

        $payments = $this->seedBilling($studentIds);
        $this->seedPayroll($teacherIds);
        $this->seedAccounting();

        $io->success(\sprintf('Creados %d profesores, %d grupos, %d alumnos y %d cobros de demostración.', \count(self::TEACHERS), \count(self::GROUPS), \count(self::STUDENTS), $payments));

        return Command::SUCCESS;
    }

    /**
     * Alta desde el inicio de temporada, cuotas de cada mes hasta hoy y cobros con fecha de hoy.
     *
     * @param array<string, string> $studentIds
     */
    private function seedBilling(array $studentIds): int
    {
        $today = LocalDate::fromInstant($this->clock->now());
        $current = YearMonth::of($today);
        $season = Season::teachingSeason($current);
        if (null === $season) {
            return 0;
        }

        $start = $season->firstMonth()->toString().'-01';
        $this->connection->executeStatement('UPDATE students_student SET joined_on = :start', ['start' => $start]);
        $this->connection->executeStatement('UPDATE classes_enrolment SET enrolled_on = :start', ['start' => $start]);

        foreach (self::ACCOUNTS as [$key, $plan, $member, $rate, $points]) {
            ($this->updateAccount)($studentIds[$key], $plan, $member, $rate);
            if ($points > 0) {
                ($this->adjustPoints)($studentIds[$key], $points);
            }
        }

        $previous = [];
        for ($month = $season->firstMonth(); !$current->isBefore($month); $month = $month->next()) {
            ($this->generateCharges)($month->toString());
            if ($month->isBefore($current)) {
                $previous[] = $month;
            }
        }

        $pay = fn (string $key, int $months, string $kind = 'monthly', string $method = 'transfer', ?string $date = null): string => ($this->registerPayment)(new PaymentRequest($studentIds[$key], $kind, $months, $method, $date ?? $today->toString(), false, null, null));
        $count = 0;
        // Los meses anteriores se cobraron en plazo, cada uno en su mes.
        foreach ($previous as $month) {
            foreach (array_keys($studentIds) as $key) {
                if (!\in_array($key, self::OVERDUE, true)) {
                    $pay($key, 1, method: 0 === $count % 3 ? 'cash' : 'transfer', date: \sprintf('%s-%02d', $month->toString(), 2 + $count % 3));
                    ++$count;
                }
            }
        }
        foreach (self::PAID_THIS_MONTH as $key => $months) {
            $pay($key, min($months, $season->monthsFrom($current)));
            ++$count;
        }
        foreach (self::MEMBERSHIP_PAID as $key) {
            $paymentId = $pay($key, 1, 'membership', 'cash');
            ++$count;
            if ('a1' === $key) {
                ($this->issueInvoice)($paymentId, 'Rocío Herrera', '00000000T', 'Calle Elvira 1, Granada');
            }
        }

        return $count;
    }

    /**
     * Sesiones propuestas desde septiembre y liquidaciones de los meses anteriores pagadas (salvo una).
     *
     * @param array<string, string> $teacherIds
     */
    private function seedPayroll(array $teacherIds): void
    {
        $today = LocalDate::fromInstant($this->clock->now());
        $current = YearMonth::of($today);
        $season = Season::teachingSeason($current);
        if (null === $season) {
            return;
        }

        for ($month = $season->firstMonth(); !$current->isBefore($month); $month = $month->next()) {
            ($this->proposeSessions)($month->toString());
            if (!$month->isBefore($current)) {
                continue;
            }
            foreach ($teacherIds as $key => $teacherId) {
                if (self::UNPAID_TEACHER !== $key || $month->next()->isBefore($current)) {
                    ($this->paySettlement)($teacherId, $month->toString(), $month->next()->toString().'-02');
                }
            }
        }
    }

    /** Facturas de proveedores del mes actual y del anterior, y un par de apuntes manuales. */
    private function seedAccounting(): void
    {
        $current = YearMonth::of(LocalDate::fromInstant($this->clock->now()));
        foreach (self::INVOICES as $invoice) {
            [$day, $offset, $number, $supplier, $concept, $category, $amount, $paid] = $invoice;
            $day = (int) $day;
            $month = -1 === $offset ? YearMonth::fromString(\sprintf('%04d-%02d', 1 === $current->month ? $current->year - 1 : $current->year, 1 === $current->month ? 12 : $current->month - 1)) : $current;
            $date = \sprintf('%s-%02d', $month->toString(), min($day, $month->days()));
            $id = ($this->registerInvoice)(new InvoiceInput($date, $number, $supplier, $concept.' · '.$month->label(), $category, $amount), null);
            if ($paid) {
                ($this->payInvoice)($id, $date, 'transfer');
            }
        }
        ($this->recordEntry)(new EntryInput($current->toString().'-02', 'expense', 'Comisión de mantenimiento de la cuenta', 'other_expenses', 'card', '6'));
        ($this->recordEntry)(new EntryInput($current->toString().'-03', 'income', 'Venta de libros de ajedrez', 'other_income', 'cash', '45'));
    }
}
