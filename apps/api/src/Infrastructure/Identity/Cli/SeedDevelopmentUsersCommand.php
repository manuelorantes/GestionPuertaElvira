<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Cli;

use App\Application\Identity\Port\PasswordHasher;
use App\Application\Identity\Port\UserRepository;
use App\Domain\Common\Clock;
use App\Domain\Common\EmailAddress;
use App\Domain\Common\FullName;
use App\Domain\Identity\PlainPassword;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\DependencyInjection\Attribute\When;

/**
 * Usuarios con contraseñas conocidas SOLO para desarrollo y tests. No existe en producción.
 * También reinicia los contadores de intentos de inicio de sesión.
 */
#[When(env: 'dev')]
#[When(env: 'test')]
#[AsCommand('app:dev:seed-users', 'Crea usuarios de prueba (solo desarrollo)')]
final readonly class SeedDevelopmentUsersCommand
{
    /** email => [nombre, rol, contraseña, debe cambiarla] */
    public const array USERS = [
        'admin@puertaelvira.test' => ['Administración Pruebas', Role::Superadministrator, 'desarrollo-admin', false],
        'junta@puertaelvira.test' => ['Junta Pruebas', Role::Administrator, 'desarrollo-junta', false],
        'profe@puertaelvira.test' => ['Profesora Pruebas', Role::Teacher, 'desarrollo-profe', false],
        'nuevo@puertaelvira.test' => ['Cuenta Nueva Pruebas', Role::Administrator, 'desarrollo-nuevo', true],
    ];

    public function __construct(
        private UserRepository $users,
        private PasswordHasher $hasher,
        private Clock $clock,
        #[Autowire(service: 'cache.rate_limiter')]
        private CacheItemPoolInterface $loginAttempts,
    ) {
    }

    public function __invoke(SymfonyStyle $io): int
    {
        $rows = [];
        foreach (self::USERS as $email => [$name, $role, $password, $mustChange]) {
            $user = $this->users->findByEmail(EmailAddress::fromString($email)) ?? $this->register($email, $name, $role, $password);
            $hash = $this->hasher->hash(PlainPassword::fromString($password));
            $mustChange ? $user->resetPassword($hash, $this->clock->now()) : $user->changePassword($hash, $this->clock->now());
            // Las cuentas de prueba siempre quedan con el rol de la lista (p. ej. al pasar admin a superadministración).
            $user->changeRole($role);
            $user->enable();
            $this->users->save($user);
            $rows[] = [$email, $role->value, $password, $mustChange ? 'sí' : 'no'];
        }

        // Las pruebas repetidas no deben quedar bloqueadas por intentos fallidos de ejecuciones anteriores.
        $this->loginAttempts->clear();
        $io->table(['Email', 'Rol', 'Contraseña (solo desarrollo)', 'Debe cambiarla'], $rows);

        return Command::SUCCESS;
    }

    private function register(string $email, string $name, Role $role, string $password): User
    {
        return User::register(UserId::generate(), EmailAddress::fromString($email), FullName::fromString($name), $role, $this->hasher->hash(PlainPassword::fromString($password)), $this->clock->now());
    }
}
