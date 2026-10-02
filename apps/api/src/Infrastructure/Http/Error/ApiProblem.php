<?php

declare(strict_types=1);

namespace App\Infrastructure\Http\Error;

use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Error HTTP con un código propio para el sobre {error: {code, message}}.
 */
final class ApiProblem extends HttpException
{
    /** @param array<string, string> $headers */
    public function __construct(int $status, public readonly string $errorCode, string $message, array $headers = [])
    {
        parent::__construct($status, $message, null, $headers);
    }
}
