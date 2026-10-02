<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine;

use Normalizer;

/** Texto normalizado para búsquedas: minúsculas y sin tildes («López» → «lopez»). */
final readonly class SearchText
{
    public static function normalise(string $text): string
    {
        $lower = mb_strtolower(trim($text));
        $decomposed = Normalizer::normalize($lower, Normalizer::FORM_D);

        return (string) preg_replace('/\p{Mn}+/u', '', \is_string($decomposed) ? $decomposed : $lower);
    }
}
