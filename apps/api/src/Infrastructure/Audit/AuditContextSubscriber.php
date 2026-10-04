<?php

declare(strict_types=1);

namespace App\Infrastructure\Audit;

use App\Application\Audit\AuditActionId;
use App\Infrastructure\Identity\Http\SessionUser;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Cada petición a la API es una acción del historial: quién la hace y qué hace se fijan como variables de la sesión
 * de PostgreSQL, y el trigger de captura las usa para agrupar y firmar los cambios (ver historial-de-cambios-con-triggers.md).
 */
final readonly class AuditContextSubscriber implements EventSubscriberInterface
{
    public function __construct(private Connection $connection, private Security $security)
    {
    }

    public static function getSubscribedEvents(): array
    {
        // Después del firewall (8): el usuario ya está autenticado.
        return [KernelEvents::REQUEST => ['onRequest', 4]];
    }

    public function onRequest(RequestEvent $event): void
    {
        $request = $event->getRequest();
        if (!$event->isMainRequest() || !str_starts_with($request->getPathInfo(), '/api/')) {
            return;
        }

        $user = $this->security->getUser();
        $authenticated = $user instanceof SessionUser ? $user->user : null;
        $this->connection->executeQuery(
            "SELECT set_config('audit.action_id', :action, false), set_config('audit.kind', 'change', false),
                    set_config('audit.user_id', :userId, false), set_config('audit.user_name', :userName, false),
                    set_config('audit.label', :label, false)",
            [
                'action' => AuditActionId::generate()->value,
                'userId' => $authenticated->id ?? '',
                'userName' => $authenticated->fullName ?? '',
                'label' => AuditLabels::route(\is_string($route = $request->attributes->get('_route')) ? $route : ''),
            ],
        );
    }
}
