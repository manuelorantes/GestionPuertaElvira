<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Http;

use App\Application\Identity\ChangeOwnPassword;
use App\Application\Identity\LogIn;
use App\Application\Identity\LogOut;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/auth', name: 'api_auth_')]
#[OA\Tag(name: 'Sesión')]
final readonly class AuthController
{
    public function __construct(private SessionCookie $cookie)
    {
    }

    #[Route('/login', name: 'login', methods: ['POST'])]
    #[OA\Post(summary: 'Inicia sesión con email y contraseña')]
    #[OA\Response(response: 200, description: 'Sesión iniciada; la cookie viaja en Set-Cookie')]
    #[OA\Response(response: 401, description: 'Email o contraseña incorrectos')]
    #[OA\Response(response: 429, description: 'Demasiados intentos')]
    public function login(Request $request, LogIn $logIn): JsonResponse
    {
        $body = JsonBody::from($request);
        $result = $logIn($body->requiredString('email'), $body->requiredString('password'), (string) $request->getClientIp());

        $response = new JsonResponse(UserPresenter::present($result->user));
        $this->cookie->attach($response, $result->token->value);

        return $response;
    }

    #[Route('/logout', name: 'logout', methods: ['POST'])]
    #[OA\Post(summary: 'Cierra la sesión actual')]
    #[OA\Response(response: 204, description: 'Sesión cerrada')]
    public function logout(Request $request, LogOut $logOut): Response
    {
        $token = $this->cookie->read($request);
        if (null !== $token) {
            $logOut($token);
        }

        $response = new Response(status: Response::HTTP_NO_CONTENT);
        $this->cookie->clear($response);

        return $response;
    }

    #[Route('/me', name: 'me', methods: ['GET'])]
    #[OA\Get(summary: 'Usuario de la sesión actual')]
    #[OA\Response(response: 200, description: 'Usuario autenticado')]
    #[OA\Response(response: 401, description: 'Sin sesión')]
    public function me(#[CurrentUser] SessionUser $current): JsonResponse
    {
        return new JsonResponse(UserPresenter::present($current->user));
    }

    #[Route('/password', name: 'password', methods: ['PUT'])]
    #[OA\Put(summary: 'Cambia la contraseña del usuario actual')]
    #[OA\Response(response: 204, description: 'Contraseña cambiada; el resto de sesiones se cierran')]
    #[OA\Response(response: 422, description: 'Contraseña actual incorrecta o nueva contraseña débil')]
    public function changePassword(Request $request, #[CurrentUser] SessionUser $current, ChangeOwnPassword $change): Response
    {
        $body = JsonBody::from($request);
        $change($current->user->id, $current->user->sessionId, $body->requiredString('currentPassword'), $body->requiredString('newPassword'));

        return new Response(status: Response::HTTP_NO_CONTENT);
    }
}
