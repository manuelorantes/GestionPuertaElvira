<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use SensitiveParameter;
use Symfony\Component\Console\Style\SymfonyStyle;

final readonly class TemporaryPasswordOutput
{
    public static function show(SymfonyStyle $io, #[SensitiveParameter] string $temporary): void
    {
        $io->writeln(\sprintf('Contraseña temporal: <info>%s</info>', $temporary));
        $io->note('Se muestra solo esta vez. Entrégala en persona; habrá que cambiarla al entrar.');
    }
}
