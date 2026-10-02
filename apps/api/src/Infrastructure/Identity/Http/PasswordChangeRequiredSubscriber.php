<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use App\Infrastructure\Http\Error\ApiProblem;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Con una contraseña temporal solo se puede consultar la sesión, cambiar la contraseña o salir.
 */
final readonly class PasswordChangeRequiredSubscriber implements EventSubscriberInterface
{
    private const array ALLOWED_ROUTES = ['api_auth_me', 'api_auth_password', 'api_auth_logout', 'api_auth_login', 'api_health'];

    public function __construct(private Security $security)
    {
    }

    public static function getSubscribedEvents(): array
    {
        // Después del firewall (8) y del enrutado (32).
        return [KernelEvents::REQUEST => ['onRequest', 7]];
    }

    public function onRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();
        if (!$event->isMainRequest() || \in_array($request->attributes->get('_route'), self::ALLOWED_ROUTES, true)) {
            return;
        }

        $user = $this->security->getUser();
        if ($user instanceof SessionUser && $user->user->mustChangePassword) {
            throw new ApiProblem(Response::HTTP_FORBIDDEN, 'password_change_required', 'Tienes que cambiar tu contraseña temporal antes de continuar.');
        }
    }
}
