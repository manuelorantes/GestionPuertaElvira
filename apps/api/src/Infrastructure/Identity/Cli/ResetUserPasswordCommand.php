<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\ResetUserPassword;
use Symfony\Component\Console\Attribute\Argument;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand('app:user:reset-password', 'Asigna una contraseña temporal y cierra todas las sesiones de la cuenta')]
final readonly class ResetUserPasswordCommand
{
    public function __construct(private ResetUserPassword $resetUserPassword)
    {
    }

    public function __invoke(SymfonyStyle $io, #[Argument('Email de la cuenta')] string $email): int
    {
        return UserCommandOutcome::run($io, function () use ($io, $email): void {
            $temporary = ($this->resetUserPassword)($email);
            $io->success('Contraseña restablecida.');
            TemporaryPasswordOutput::show($io, $temporary);
        });
    }
}
