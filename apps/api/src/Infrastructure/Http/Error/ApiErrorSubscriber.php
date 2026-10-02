<?php

declare(strict_types=1);

namespace App\Infrastructure\Http\Error;

use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Traduce cualquier excepción bajo /api a un sobre de error JSON uniforme:
 *   {"error": {"code": "...", "message": "..."}}
 * Los errores de programación (5xx) se registran con contexto y nunca exponen detalles internos.
 */
final readonly class ApiErrorSubscriber implements EventSubscriberInterface
{
    private const array ERRORS = [
        Response::HTTP_BAD_REQUEST => ['bad_request', 'Petición incorrecta.'],
        Response::HTTP_UNAUTHORIZED => ['unauthorized', 'Necesitas iniciar sesión.'],
        Response::HTTP_FORBIDDEN => ['forbidden', 'No tienes permiso para esta acción.'],
        Response::HTTP_NOT_FOUND => ['not_found', 'Recurso no encontrado.'],
        Response::HTTP_METHOD_NOT_ALLOWED => ['method_not_allowed', 'Método no permitido.'],
        Response::HTTP_UNPROCESSABLE_ENTITY => ['unprocessable', 'Los datos enviados no son válidos.'],
        Response::HTTP_TOO_MANY_REQUESTS => ['too_many_requests', 'Demasiados intentos. Prueba más tarde.'],
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

        $exception = $event->getThrowable();
        $status = $exception instanceof HttpExceptionInterface
            ? $exception->getStatusCode()
            : Response::HTTP_INTERNAL_SERVER_ERROR;

        if ($status >= Response::HTTP_INTERNAL_SERVER_ERROR) {
            $this->logger->error('Unhandled API error', ['exception' => $exception]);
        }

        [$code, $message] = self::ERRORS[$status] ?? ['internal_error', 'Se ha producido un error inesperado.'];

        $headers = $exception instanceof HttpExceptionInterface ? $exception->getHeaders() : [];
        $event->setResponse(new JsonResponse(['error' => ['code' => $code, 'message' => $message]], $status, $headers));
    }
}
