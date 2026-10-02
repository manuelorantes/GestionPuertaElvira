<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\Error\EmailAlreadyRegistered;
use App\Application\Identity\Error\UserNotFound;
use App\Domain\Common\InvalidValue;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Convierte los errores operacionales de la gestión de cuentas en mensajes y código de salida.
 */
final readonly class UserCommandOutcome
{
    public static function run(SymfonyStyle $io, callable $action): int
    {
        try {
            $action();

            return Command::SUCCESS;
        } catch (EmailAlreadyRegistered|UserNotFound|InvalidValue $error) {
            $io->error($error->getMessage());

            return Command::FAILURE;
        }
    }
}
