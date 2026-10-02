<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use App\Application\Identity\AuthenticateSession;
use App\Application\Identity\Error\SessionNotValid;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

/**
 * Lee la cookie de sesión y delega la validación en el caso de uso AuthenticateSession.
 * Si la sesión no es válida, la petición sigue como anónima y access_control decide.
 */
final class SessionCookieAuthenticator extends AbstractAuthenticator
{
    public function __construct(
        private readonly AuthenticateSession $authenticateSession,
        private readonly SessionCookie $cookie,
    ) {
    }

    public function supports(Request $request): bool
    {
        return null !== $this->cookie->read($request);
    }

    public function authenticate(Request $request): Passport
    {
        try {
            $user = new SessionUser(($this->authenticateSession)((string) $this->cookie->read($request)));
        } catch (SessionNotValid $invalid) {
            throw new CustomUserMessageAuthenticationException($invalid->getMessage(), previous: $invalid);
        }

        return new SelfValidatingPassport(new UserBadge($user->getUserIdentifier(), static fn (): SessionUser => $user));
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        return null;
    }
}
