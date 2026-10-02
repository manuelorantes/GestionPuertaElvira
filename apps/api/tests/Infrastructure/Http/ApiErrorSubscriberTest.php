<?php

declare(strict_types=1);

namespace App\Tests\Infrastructure\Http;

use App\Infrastructure\Http\Error\ApiErrorSubscriber;
use LogicException;
use PHPUnit\Framework\TestCase;
use Psr\Log\AbstractLogger;
use Stringable;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Throwable;

final class ApiErrorSubscriberTest extends TestCase
{
    public function test_should_hide_internal_details_and_log_when_an_unexpected_error_happens(): void
    {
        $logger = new class extends AbstractLogger {
            /** @var list<string> */
            public array $errors = [];

            public function log($level, Stringable|string $message, array $context = []): void
            {
                $this->errors[] = (string) $message;
            }
        };
        $event = $this->exceptionEvent('/api/anything', new LogicException('SQLSTATE secret detail'));

        new ApiErrorSubscriber($logger)->onException($event);

        self::assertSame(500, $event->getResponse()?->getStatusCode());
        self::assertJsonStringEqualsJsonString(
            '{"error":{"code":"internal_error","message":"Se ha producido un error inesperado."}}',
            (string) $event->getResponse()->getContent(),
        );
        self::assertSame(['Unhandled API error'], $logger->errors);
    }

    public function test_should_leave_the_error_untouched_when_the_path_is_outside_the_api(): void
    {
        $event = $this->exceptionEvent('/somewhere-else', new LogicException('boom'));

        new ApiErrorSubscriber(new class extends AbstractLogger {
            public function log($level, Stringable|string $message, array $context = []): void
            {
            }
        })->onException($event);

        self::assertNull($event->getResponse());
    }

    private function exceptionEvent(string $path, Throwable $exception): ExceptionEvent
    {
        return new ExceptionEvent(
            self::createStub(HttpKernelInterface::class),
            Request::create($path),
            HttpKernelInterface::MAIN_REQUEST,
            $exception,
        );
    }
}
