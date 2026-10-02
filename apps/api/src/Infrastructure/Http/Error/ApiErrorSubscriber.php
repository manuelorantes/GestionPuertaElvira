<?php

declare(strict_types=1);

namespace App\Infrastructure\Http\Error;

use App\Application\Identity\Error\CurrentPasswordMismatch;
use App\Application\Identity\Error\EmailAlreadyRegistered;
use App\Application\Identity\Error\InvalidCredentials;
use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Domain\Common\InvalidValue;
use App\Domain\Identity\Error\WeakPassword;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Throwable;

/**
 * Traduce cualquier excepción bajo /api a un sobre de error JSON uniforme:
 *   {"error": {"code": "...", "message": "..."}}
 * Los errores operacionales conocidos usan su propio mensaje (en español, apto para la persona usuaria).
 * Los errores de programación (5xx) se registran con contexto y nunca exponen detalles internos.
 */
final readonly class ApiErrorSubscriber implements EventSubscriberInterface
{
    private const array HTTP_ERRORS = [
        Response::HTTP_BAD_REQUEST => ['bad_request', 'Petición incorrecta.'],
        Response::HTTP_UNAUTHORIZED => ['unauthorized', 'Necesitas iniciar sesión.'],
        Response::HTTP_FORBIDDEN => ['forbidden', 'No tienes permiso para esta acción.'],
        Response::HTTP_NOT_FOUND => ['not_found', 'Recurso no encontrado.'],
        Response::HTTP_METHOD_NOT_ALLOWED => ['method_not_allowed', 'Método no permitido.'],
        Response::HTTP_UNPROCESSABLE_ENTITY => ['unprocessable', 'Los datos enviados no son válidos.'],
        Response::HTTP_TOO_MANY_REQUESTS => ['too_many_requests', 'Demasiados intentos. Prueba más tarde.'],
    ];

    /** Errores operacionales de la aplicación: clase => [estado, código]. */
    private const array DOMAIN_ERRORS = [
        InvalidCredentials::class => [Response::HTTP_UNAUTHORIZED, 'invalid_credentials'],
        TooManyLoginAttempts::class => [Response::HTTP_TOO_MANY_REQUESTS, 'too_many_requests'],
        CurrentPasswordMismatch::class => [Response::HTTP_UNPROCESSABLE_ENTITY, 'current_password_mismatch'],
        WeakPassword::class => [Response::HTTP_UNPROCESSABLE_ENTITY, 'weak_password'],
        EmailAlreadyRegistered::class => [Response::HTTP_CONFLICT, 'email_already_registered'],
        InvalidValue::class => [Response::HTTP_UNPROCESSABLE_ENTITY, 'unprocessable'],
    ];

    public function __construct(private LoggerInterface $logger)
    {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => ['onException', -64]];
    }

    public function onException(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api')) {
            return;
        }

        $event->setResponse($this->toResponse($event->getThrowable()));
    }

    private function toResponse(Throwable $exception): JsonResponse
    {
        if (isset(self::DOMAIN_ERRORS[$exception::class])) {
            [$status, $code] = self::DOMAIN_ERRORS[$exception::class];
            $headers = $exception instanceof TooManyLoginAttempts ? ['Retry-After' => (string) $exception->retryAfterSeconds] : [];

            return self::envelope($status, $code, $exception->getMessage(), $headers);
        }

        if ($exception instanceof ApiProblem) {
            return self::envelope($exception->getStatusCode(), $exception->errorCode, $exception->getMessage(), $exception->getHeaders());
        }

        $status = $exception instanceof HttpExceptionInterface ? $exception->getStatusCode() : Response::HTTP_INTERNAL_SERVER_ERROR;
        if ($status >= Response::HTTP_INTERNAL_SERVER_ERROR) {
            $this->logger->error('Unhandled API error', ['exception' => $exception]);
        }

        [$code, $message] = self::HTTP_ERRORS[$status] ?? ['internal_error', 'Se ha producido un error inesperado.'];
        $headers = $exception instanceof HttpExceptionInterface ? $exception->getHeaders() : [];

        return self::envelope($status, $code, $message, $headers);
    }

    /** @param array<mixed> $headers */
    private static function envelope(int $status, string $code, string $message, array $headers = []): JsonResponse
    {
        /** @var array<string, string> $headers */
        return new JsonResponse(['error' => ['code' => $code, 'message' => $message]], $status, $headers);
    }
}
