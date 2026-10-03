<?php

declare(strict_types=1);

namespace App\Infrastructure\Billing\Cli;

use App\Application\Billing\GenerateMonthlyCharges;
use App\Domain\Common\Clock;
use App\Domain\Common\InvalidValue;
use App\Domain\Common\LocalDate;
use App\Domain\Common\YearMonth;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Attribute\Option;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Style\SymfonyStyle;

/** Crea las cuotas del mes que falten. Pensado para programarse el día 1 de cada mes. */
#[AsCommand('app:billing:generate-charges', 'Genera las cuotas del mes (por defecto, el actual)')]
final readonly class GenerateChargesCommand
{
    public function __construct(private GenerateMonthlyCharges $generate, private Clock $clock)
    {
    }

    public function __invoke(
        SymfonyStyle $io,
        #[Option('Mes con formato AAAA-MM')]
        ?string $month = null,
    ): int {
        try {
            $period = null === $month ? YearMonth::of(LocalDate::fromInstant($this->clock->now())) : YearMonth::fromString($month);
        } catch (InvalidValue $e) {
            $io->error($e->getMessage());

            return Command::INVALID;
        }

        ($this->generate)($period->toString());
        $io->success(\sprintf('Cuotas de %s generadas.', $period->label()));

        return Command::SUCCESS;
    }
}
