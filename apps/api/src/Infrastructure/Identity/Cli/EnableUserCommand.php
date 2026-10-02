<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\EnableUser;
use Symfony\Component\Console\Attribute\Argument;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand('app:user:enable', 'Reactiva una cuenta desactivada')]
final readonly class EnableUserCommand
{
    public function __construct(private EnableUser $enableUser)
    {
    }

    public function __invoke(SymfonyStyle $io, #[Argument('Email de la cuenta')] string $email): int
    {
        return UserCommandOutcome::run($io, function () use ($io, $email): void {
            ($this->enableUser)($email);
            $io->success('Cuenta reactivada.');
        });
    }
}
