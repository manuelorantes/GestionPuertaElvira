<?php

declare(strict_types=1);

namespace App\Infrastructure\Http;

use App\Infrastructure\Http\Error\ApiProblem;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Políticas transversales de /api (ver specs/decisions/api-y-web-en-el-mismo-origen.md):
 * - las peticiones que cambian estado deben ser JSON (defensa CSRF en profundidad);
 *   solo la subida de documentos admite multipart, y entonces exige la cabecera X-Requested-With,
 *   que un formulario de otro sitio no puede enviar;
 * - ninguna respuesta se guarda en caché.
 */
final readonly class ApiRequestPolicySubscriber implements EventSubscriberInterface
{
    private const array STATE_CHANGING = ['POST', 'PUT', 'PATCH', 'DELETE'];
    private const string UPLOADS = '#^/api/admin/accounting/invoices(/[0-9a-f-]{36}/attachment)?$#';

    public static function getSubscribedEvents(): array
    {
        return [
            // Después del enrutado (32), para que un método no admitido siga siendo 405; antes del firewall (8).
            KernelEvents::REQUEST => ['onRequest', 16],
            KernelEvents::RESPONSE => 'onResponse',
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();
        if (!$event->isMainRequest() || !self::isApi($request->getPathInfo()) || !\in_array($request->getMethod(), self::STATE_CHANGING, true)) {
            return;
        }

        if ('form' === $request->getContentTypeFormat() && 1 === preg_match(self::UPLOADS, $request->getPathInfo())
            && str_starts_with((string) $request->headers->get('Content-Type'), 'multipart/form-data')) {
            if ('fetch' !== $request->headers->get('X-Requested-With')) {
                throw new ApiProblem(Response::HTTP_FORBIDDEN, 'forbidden', 'Subida no permitida.');
            }

            return;
        }

        if ('json' !== $request->getContentTypeFormat()) {
            throw new ApiProblem(Response::HTTP_UNSUPPORTED_MEDIA_TYPE, 'unsupported_media_type', 'La petición debe enviarse como JSON.');
        }
    }

    public function onResponse(ResponseEvent $event): void
    {
        if (self::isApi($event->getRequest()->getPathInfo())) {
            $event->getResponse()->headers->set('Cache-Control', 'no-store, private');
        }
    }

    private static function isApi(string $path): bool
    {
        return str_starts_with($path, '/api/');
    }
}
