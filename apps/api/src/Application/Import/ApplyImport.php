<?php

declare(strict_types=1);

namespace App\Application\Import;

use App\Application\Accounting\EntryInput;
use App\Application\Accounting\RecordEntry;
use App\Application\Audit\Port\AuditContext;
use App\Application\Billing\ImportPayment;
use App\Application\Billing\Port\StudentAccountRepository;
use App\Application\Common\Port\TransactionRunner;
use App\Application\Import\Error\PossibleDuplicate;
use App\Application\Import\Port\StudentMatcher;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentInput;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\StudentAccount;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;

/**
 * Importa una fila revisada: alta o vínculo del alumno, sus cobros mes a mes, la cuota de socio y los extras.
 * Cada fila es una transacción y una acción del historial propias.
 */
final readonly class ApplyImport
{
    /** Día del mes en que se fechan los cobros importados (dentro del plazo del 1 al 5). */
    private const int PAYMENT_DAY = 3;

    public function __construct(
        private SpreadsheetParser $parser,
        private StudentMatcher $students,
        private RegisterStudent $register,
        private ImportPayment $importPayment,
        private StudentAccountRepository $accounts,
        private RecordEntry $recordEntry,
        private TransactionRunner $transactions,
        private Clock $clock,
        private AuditContext $audit,
    ) {
    }

    /** Importa una sola fila (cada fila es su propia acción: si falla, no afecta a las demás). */
    public function __invoke(string $text, ImportDecision $decision): ImportResult
    {
        $today = LocalDate::fromInstant($this->clock->now());
        $row = null;
        foreach ($this->parser->parse($text, $today) as $parsed) {
            if ($parsed->line === $decision->line) {
                $row = $parsed;
            }
        }
        if (null === $row) {
            throw new InvalidValue('line', \sprintf('La fila %d no está en la hoja.', $decision->line));
        }
        if (ImportDecision::SKIP === $decision->action) {
            return new ImportResult($row->line, $decision->action, null, $row->fullName, 0, false, 0);
        }

        return $this->transactions->run(function () use ($row, $decision, $today): ImportResult {
            $name = $decision->fullName ?? $row->fullName;
            // La acción del historial nace con el primer cambio: la etiqueta va antes del alta.
            $this->audit->relabel('Importar fila de la hoja: '.$name);
            $studentId = $this->student($row, $decision, $today);

            $payments = 0;
            foreach ($row->monthlyCents as $month => $cents) {
                $period = YearMonth::fromString($month);
                $payments += null === ($this->importPayment)($studentId, ChargeKind::Monthly, $period, Money::cents($cents), self::paymentDate($period, $today)) ? 0 : 1;
            }
            $member = null !== $row->membershipCents && $row->membershipCents > 0;
            if ($member) {
                $this->makeMember($studentId);
                $season = Season::containing(self::firstMonth($row, $today));
                $payments += null === ($this->importPayment)($studentId, ChargeKind::Membership, $season->firstMonth(), Money::cents($row->membershipCents), self::paymentDate($season->firstMonth(), $today)) ? 0 : 1;
            }
            $entries = 0;
            $entryDate = self::paymentDate(self::firstMonth($row, $today), $today)->toString();
            foreach ([['Chándal y polo', $row->kitCents], ['Licencia federativa', $row->federationCents]] as [$concept, $cents]) {
                if (null !== $cents && $cents > 0) {
                    ($this->recordEntry)(new EntryInput($entryDate, 'income', $concept.' · '.$name, 'other_income', 'transfer', (string) ($cents / 100)));
                    ++$entries;
                }
            }

            return new ImportResult($row->line, $decision->action, $studentId, $name, $payments, $member, $entries);
        });
    }

    private function student(ImportedRow $row, ImportDecision $decision, LocalDate $today): string
    {
        if (ImportDecision::LINK === $decision->action) {
            $id = $decision->studentId ?? '';
            if (!$this->students->exists($id)) {
                throw new InvalidValue('studentId', \sprintf('Fila %d: el alumno al que vincular no existe.', $row->line));
            }

            return $id;
        }
        if (ImportDecision::CREATE !== $decision->action) {
            throw new InvalidValue('action', \sprintf('Fila %d: decisión desconocida.', $row->line));
        }
        $name = $decision->fullName ?? $row->fullName;
        if (!$decision->confirmDuplicate) {
            $exact = $this->students->byName($name);
            $candidates = null !== $exact ? [$exact] : $this->students->similar($name);
            if ([] !== $candidates) {
                throw new PossibleDuplicate($candidates);
            }
        }

        $guardianName = $decision->guardianName ?? $row->guardianName;
        $guardianPhone = $decision->guardianPhone ?? $row->guardianPhone;
        $input = new StudentInput(
            $decision->fullName ?? $row->fullName,
            $decision->birthDate ?? $row->birthDate ?? '',
            null,
            $decision->email ?? $row->email,
            null !== $guardianName && null !== $guardianPhone && '' !== $guardianName && '' !== $guardianPhone ? [['name' => $guardianName, 'phone' => $guardianPhone]] : [],
            null,
            null,
            false,
        );
        $joined = self::paymentDate(self::firstMonth($row, $today), $today);

        return ($this->register)($input, $decision->groupIds, [], false, \sprintf('%s-01', YearMonth::of($joined)->toString()));
    }

    private function makeMember(string $studentId): void
    {
        $ref = StudentRef::fromString($studentId);
        $account = $this->accounts->account($ref) ?? StudentAccount::open($ref);
        if (!$account->isMember()) {
            $account->update($account->preferredPlan(), true, $account->privateRate());
            $this->accounts->saveAccount($account);
        }
    }

    /** Primer mes con cobro en la hoja, o el inicio de la temporada en curso. */
    private static function firstMonth(ImportedRow $row, LocalDate $today): YearMonth
    {
        $months = array_keys($row->monthlyCents);
        sort($months);

        return [] === $months ? Season::containing(YearMonth::of($today))->firstMonth() : YearMonth::fromString((string) $months[0]);
    }

    /** El día 3 de ese mes, o hoy si ese mes todavía no ha llegado. */
    private static function paymentDate(YearMonth $month, LocalDate $today): LocalDate
    {
        $date = LocalDate::fromString(\sprintf('%s-%02d', $month->toString(), self::PAYMENT_DAY));

        return $today->isBefore($date) ? $today : $date;
    }
}
