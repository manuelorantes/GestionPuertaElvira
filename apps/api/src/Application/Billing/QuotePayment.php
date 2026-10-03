<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Error\BillingStudentNotFound;
use App\Application\Billing\Port\BillingSettingsRepository;
use App\Application\Billing\Port\ChargeRepository;
use App\Application\Billing\Port\StudentAccountRepository;
use App\Application\Billing\Port\StudentDirectory;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\Error\InvalidPaymentRequest;
use App\Domain\Billing\FeeCalculator;
use App\Domain\Billing\PaymentMethod;
use App\Domain\Billing\PreferredPlan;
use App\Domain\Billing\Proration;
use App\Domain\Billing\Quote;
use App\Domain\Billing\QuoteLine;
use App\Domain\Billing\SpecialDiscount;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;

/**
 * Calcula un cobro sin guardarlo: qué meses cubre (primero las cuotas pendientes más antiguas) y cuánto cuesta.
 */
final readonly class QuotePayment
{
    public function __construct(
        private StudentDirectory $directory,
        private BillingSettingsRepository $settings,
        private StudentAccountRepository $accounts,
        private ChargeRepository $charges,
        private Clock $clock,
    ) {
    }

    public function __invoke(PaymentRequest $request): PaymentQuote
    {
        PaymentMethod::fromName($request->method);
        $date = LocalDate::fromString($request->date);
        $ref = StudentRef::fromString($request->studentId);
        $student = $this->directory->find($ref, $date) ?? throw new BillingStudentNotFound();
        $kind = ChargeKind::tryFrom($request->kind) ?? throw new InvalidValue('kind', 'Tipo de cobro desconocido: usa monthly o membership.');
        $settings = $this->settings->get();

        if (ChargeKind::Membership === $kind) {
            return $this->membership($student, $ref, $date);
        }

        $periods = $this->periods($ref, $date, $request->months);
        $special = null === $request->specialPercent ? null : new SpecialDiscount($request->specialPercent, (string) $request->specialConcept);
        $proration = $request->prorate ? new Proration((int) substr($date->toString(), 8, 2), $periods[0]->days()) : null;
        $profile = FeeProfiles::of($student, $this->accounts->account($ref), $settings);
        $calculator = new FeeCalculator();
        $quote = $calculator->quote($profile, $settings, $request->months, $special, $proration);
        if (0 === $quote->total->cents && 0 === $quote->gross->cents) {
            throw InvalidPaymentRequest::nothingToPay();
        }

        return new PaymentQuote($student, $kind, $date, $quote, $periods, self::concept($periods), $calculator->quote($profile, $settings, 1)->total);
    }

    /** Meses que propone el formulario según la forma de pago preferida y lo que queda de temporada. */
    public function suggestion(string $studentId): int
    {
        $ref = StudentRef::fromString($studentId);
        $plan = $this->accounts->account($ref)?->preferredPlan() ?? PreferredPlan::Monthly;

        return $plan->monthsWithin($this->available($ref, LocalDate::fromInstant($this->clock->now())));
    }

    /** Meses que aún se pueden cobrar: cuotas pendientes más los que quedan de temporada. */
    public function remainingMonths(string $studentId): int
    {
        return $this->available(StudentRef::fromString($studentId), LocalDate::fromInstant($this->clock->now()));
    }

    /** @return non-empty-list<YearMonth> */
    private function periods(StudentRef $ref, LocalDate $date, int $months): array
    {
        if ($months < 1 || $months > FeeCalculator::MAX_MONTHS) {
            throw InvalidPaymentRequest::months();
        }
        $available = $this->available($ref, $date);
        if ($months > $available) {
            throw InvalidPaymentRequest::beyondSeason($available);
        }

        $periods = array_map(static fn (Charge $c): YearMonth => $c->period(), $this->charges->unpaidFor($ref, ChargeKind::Monthly));
        for ($next = $this->firstUncharged($ref, $date); \count($periods) < $months; $next = $next->next()) {
            $periods[] = $next;
        }

        $selected = array_values(\array_slice($periods, 0, $months));
        \assert([] !== $selected);

        return $selected;
    }

    private function available(StudentRef $ref, LocalDate $date): int
    {
        $first = $this->firstUncharged($ref, $date);
        $season = Season::containing($first);

        return \count($this->charges->unpaidFor($ref, ChargeKind::Monthly)) + ($season->includes($first) ? $season->monthsFrom($first) : 0);
    }

    /** Primer mes que aún no tiene cuota: el siguiente a la última, y nunca antes del mes del cobro ni fuera de temporada. */
    private function firstUncharged(StudentRef $ref, LocalDate $date): YearMonth
    {
        $current = YearMonth::of($date);
        if (null === Season::teachingSeason($current)) {
            $current = Season::containing($current)->firstMonth();
        }
        $latest = $this->charges->latestMonthlyPeriod($ref);

        return null !== $latest && !$latest->isBefore($current) ? $latest->next() : $current;
    }

    private function membership(BillingStudent $student, StudentRef $ref, LocalDate $date): PaymentQuote
    {
        $season = Season::containing(YearMonth::of($date));
        $charge = $this->charges->chargeFor($ref, ChargeKind::Membership, $season->firstMonth());
        $isMember = true === $this->accounts->account($ref)?->isMember();
        if (true === $charge?->isPaid() || (null === $charge && !$isMember)) {
            throw InvalidPaymentRequest::nothingToPay();
        }

        $fee = $charge?->amount() ?? $this->settings->get()->tariff->membershipFee;
        $concept = 'Cuota de socio '.$season->label();
        $quote = new Quote([new QuoteLine($concept, $fee)], $fee, 0, $fee, $fee);

        return new PaymentQuote($student, ChargeKind::Membership, $date, $quote, [$season->firstMonth()], $concept, $fee);
    }

    /** @param non-empty-list<YearMonth> $periods */
    private static function concept(array $periods): string
    {
        $first = $periods[0];
        $last = $periods[\count($periods) - 1];
        if ($first->equals($last)) {
            return ucfirst($first->label());
        }

        $from = $first->year === $last->year ? $first->shortLabel() : ucfirst($first->label());

        return \sprintf('%s – %s', $from, lcfirst($last->label()));
    }
}
