<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\ChangeUserRole;
use Symfony\Component\Console\Attribute\Argument;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand('app:user:role', 'Cambia el rol de una cuenta (administrator | teacher)')]
final readonly class ChangeUserRoleCommand
{
    public function __construct(private ChangeUserRole $changeUserRole)
    {
    }

    public function __invoke(
        SymfonyStyle $io,
        #[Argument('Email de la cuenta')]
        string $email,
        #[Argument('administrator o teacher')]
        string $role,
    ): int {
        return UserCommandOutcome::run($io, function () use ($io, $email, $role): void {
            ($this->changeUserRole)($email, $role);
            $io->success('Rol actualizado. Se aplica en la siguiente petición de la persona.');
        });
    }
}
