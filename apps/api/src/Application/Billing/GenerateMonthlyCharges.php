<?php

declare(strict_types=1);

namespace App\Application\Billing;

use App\Application\Billing\Port\BillingSettingsRepository;
use App\Application\Billing\Port\ChargeRepository;
use App\Application\Billing\Port\StudentAccountRepository;
use App\Application\Billing\Port\StudentDirectory;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\FeeCalculator;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\Clock;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;

/**
 * Crea las cuotas del mes que falten (idempotente): la mensual de cada alumno activo y la de socio de la temporada.
 * Nunca para meses futuros.
 */
final readonly class GenerateMonthlyCharges
{
    public function __construct(
        private StudentDirectory $directory,
        private BillingSettingsRepository $settings,
        private StudentAccountRepository $accounts,
        private ChargeRepository $charges,
        private Clock $clock,
    ) {
    }

    public function __invoke(string $month): void
    {
        $period = YearMonth::fromString($month);
        $season = Season::teachingSeason($period);
        // Los meses futuros no se generan: solo existen si se pagan por adelantado.
        if (null === $season || YearMonth::of(LocalDate::fromInstant($this->clock->now()))->isBefore($period)) {
            return;
        }

        $settings = $this->settings->get();
        $calculator = new FeeCalculator();
        foreach ($this->directory->activeIn($period) as $student) {
            $ref = StudentRef::fromString($student->id);
            $account = $this->accounts->account($ref);

            if (null === $this->charges->chargeFor($ref, ChargeKind::Monthly, $period)) {
                $amount = $calculator->quote(FeeProfiles::of($student, $account, $settings), $settings, 1)->total;
                if ($amount->cents > 0) {
                    $this->charges->saveCharge(Charge::create(ChargeId::generate(), $ref, ChargeKind::Monthly, $period, $amount));
                }
            }

            if (true === $account?->isMember() && null === $this->charges->chargeFor($ref, ChargeKind::Membership, $season->firstMonth())) {
                $this->charges->saveCharge(Charge::create(ChargeId::generate(), $ref, ChargeKind::Membership, $season->firstMonth(), $settings->tariff->membershipFee));
            }
        }
    }
}
