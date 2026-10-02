<?php

declare(strict_types=1);

namespace App\Infrastructure\Http;

use App\Infrastructure\Logging\RequestId;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Asigna un identificador a cada petición para correlacionar logs y respuestas.
 */
final readonly class RequestIdSubscriber implements EventSubscriberInterface
{
    public const string HEADER = 'X-Request-Id';

    public function __construct(private RequestId $requestId)
    {
    }

    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onRequest', 255],
            KernelEvents::RESPONSE => ['onResponse', -255],
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        if ($event->isMainRequest()) {
            $this->requestId->renew();
        }
    }

    public function onResponse(ResponseEvent $event): void
    {
        if ($event->isMainRequest()) {
            $event->getResponse()->headers->set(self::HEADER, $this->requestId->current());
        }
    }
}
