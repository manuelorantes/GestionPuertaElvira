<?php

declare(strict_types=1);

namespace App\Infrastructure\Http\Error;

use App\Domain\Common\HasErrorDetails;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Error HTTP con un código propio para el sobre {error: {code, message}}.
 */
final class ApiProblem extends HttpException implements HasErrorDetails
{
    /**
     * @param array<string, string>      $headers
     * @param array<string, scalar|null> $details
     */
    public function __construct(
        int $status,
        public readonly string $errorCode,
        string $message,
        array $headers = [],
        private readonly array $details = [],
    ) {
        parent::__construct($status, $message, null, $headers);
    }

    public function details(): array
    {
        return $this->details;
    }
}
