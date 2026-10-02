<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\Cookie;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cookie de sesión: HttpOnly, SameSite=Strict, Path=/ y, en producción, __Host- con Secure.
 */
final readonly class SessionCookie
{
    public function __construct(
        #[Autowire(env: 'SESSION_COOKIE_NAME')]
        private string $name,
        #[Autowire(env: 'bool:SESSION_COOKIE_SECURE')]
        private bool $secure,
    ) {
    }

    public function read(Request $request): ?string
    {
        $value = $request->cookies->get($this->name);

        return \is_string($value) && '' !== $value ? $value : null;
    }

    public function attach(Response $response, string $token): void
    {
        $response->headers->setCookie(
            Cookie::create($this->name, $token, 0, '/', null, $this->secure, true, false, Cookie::SAMESITE_STRICT),
        );
    }

    public function clear(Response $response): void
    {
        $response->headers->clearCookie($this->name, '/', null, $this->secure, true, Cookie::SAMESITE_STRICT);
    }
}
