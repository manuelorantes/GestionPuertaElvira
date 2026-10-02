<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\RegisterUser;
use Symfony\Component\Console\Attribute\Argument;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand('app:user:create', 'Da de alta una cuenta (administrator | teacher) con contraseña temporal')]
final readonly class CreateUserCommand
{
    public function __construct(private RegisterUser $registerUser)
    {
    }

    public function __invoke(
        SymfonyStyle $io,
        #[Argument('Email de la persona')]
        string $email,
        #[Argument('Nombre y apellidos')]
        string $name,
        #[Argument('administrator o teacher')]
        string $role,
    ): int {
        return UserCommandOutcome::run($io, function () use ($io, $email, $name, $role): void {
            $temporary = ($this->registerUser)($email, $name, $role);
            $io->success('Cuenta creada.');
            TemporaryPasswordOutput::show($io, $temporary);
        });
    }
}
