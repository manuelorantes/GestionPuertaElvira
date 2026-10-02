<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\DisableUser;
use Symfony\Component\Console\Attribute\Argument;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand('app:user:disable', 'Desactiva una cuenta y cierra todas sus sesiones')]
final readonly class DisableUserCommand
{
    public function __construct(private DisableUser $disableUser)
    {
    }

    public function __invoke(SymfonyStyle $io, #[Argument('Email de la cuenta')] string $email): int
    {
        return UserCommandOutcome::run($io, function () use ($io, $email): void {
            ($this->disableUser)($email);
            $io->success('Cuenta desactivada y sesiones cerradas.');
        });
    }
}
