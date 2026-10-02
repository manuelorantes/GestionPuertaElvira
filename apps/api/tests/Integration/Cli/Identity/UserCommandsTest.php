<?php

declare(strict_types=1);

namespace App\Tests\Integration\Cli\Identity;

use App\Domain\Identity\AccountStatus;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Infrastructure\Persistence\Doctrine\Repository\Identity\DoctrineUserRepository;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

final class UserCommandsTest extends KernelTestCase
{
    public function test_should_create_a_user_and_print_its_temporary_password_once(): void
    {
        $tester = $this->execute('app:user:create', ['email' => 'Junta@Club.es', 'name' => 'Lucía Moreno Gil', 'role' => 'administrator']);

        self::assertSame(Command::SUCCESS, $tester->getStatusCode());
        $user = $this->user('junta@club.es');
        self::assertSame(Role::Administrator, $user->role());
        self::assertTrue($user->mustChangePassword());
        self::assertMatchesRegularExpression('/Contraseña temporal: [a-z2-9]{4}(-[a-z2-9]{4}){3}/', $tester->getDisplay());
    }

    public function test_should_fail_with_a_clear_message_when_the_email_already_exists(): void
    {
        $this->execute('app:user:create', ['email' => 'junta@club.es', 'name' => 'Lucía Moreno Gil', 'role' => 'administrator']);

        $tester = $this->execute('app:user:create', ['email' => 'junta@club.es', 'name' => 'Otra Persona', 'role' => 'teacher']);

        self::assertSame(Command::FAILURE, $tester->getStatusCode());
        self::assertStringContainsString('Ya existe una cuenta con ese email.', $tester->getDisplay());
    }

    public function test_should_disable_enable_and_change_the_role_of_an_account(): void
    {
        $this->execute('app:user:create', ['email' => 'profe@club.es', 'name' => 'Carlos Ruiz Márquez', 'role' => 'teacher']);

        $this->execute('app:user:disable', ['email' => 'profe@club.es']);
        self::assertSame(AccountStatus::Disabled, $this->user('profe@club.es')->status());

        $this->execute('app:user:enable', ['email' => 'profe@club.es']);
        self::assertSame(AccountStatus::Active, $this->user('profe@club.es')->status());

        $this->execute('app:user:role', ['email' => 'profe@club.es', 'role' => 'administrator']);
        self::assertSame(Role::Administrator, $this->user('profe@club.es')->role());
    }

    public function test_should_reset_the_password_and_print_the_new_temporary_one(): void
    {
        $this->execute('app:user:create', ['email' => 'junta@club.es', 'name' => 'Lucía Moreno Gil', 'role' => 'administrator']);
        $before = $this->user('junta@club.es')->passwordHash();

        $tester = $this->execute('app:user:reset-password', ['email' => 'junta@club.es']);

        self::assertStringContainsString('Contraseña temporal:', $tester->getDisplay());
        self::assertNotEquals($before, $this->user('junta@club.es')->passwordHash());
    }

    public function test_should_fail_when_the_account_does_not_exist(): void
    {
        $tester = $this->execute('app:user:disable', ['email' => 'nadie@club.es']);

        self::assertSame(Command::FAILURE, $tester->getStatusCode());
        self::assertStringContainsString('No existe ninguna cuenta con ese email.', $tester->getDisplay());
    }

    public function test_should_seed_development_users_idempotently(): void
    {
        $this->execute('app:dev:seed-users', []);
        $tester = $this->execute('app:dev:seed-users', []);

        self::assertSame(Command::SUCCESS, $tester->getStatusCode());
        self::assertFalse($this->user('admin@puertaelvira.test')->mustChangePassword());
        self::assertSame(Role::Teacher, $this->user('profe@puertaelvira.test')->role());
        self::assertTrue($this->user('nuevo@puertaelvira.test')->mustChangePassword());
    }

    /** @param array<string, string> $input */
    private function execute(string $command, array $input): CommandTester
    {
        $tester = new CommandTester(new Application(self::bootKernel())->find($command));
        $tester->execute($input);

        return $tester;
    }

    private function user(string $email): User
    {
        $user = self::getContainer()->get(DoctrineUserRepository::class)->findByEmail(EmailAddress::fromString($email));
        self::assertNotNull($user);

        return $user;
    }
}
