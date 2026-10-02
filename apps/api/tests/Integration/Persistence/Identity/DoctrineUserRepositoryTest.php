<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Identity;

use App\Domain\Identity\AccountStatus;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\FullName;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\Role;
use App\Domain\Identity\User;
use App\Domain\Identity\UserId;
use App\Infrastructure\Persistence\Doctrine\Repository\Identity\DoctrineUserRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class DoctrineUserRepositoryTest extends KernelTestCase
{
    private DoctrineUserRepository $repository;

    protected function setUp(): void
    {
        $this->repository = self::getContainer()->get(DoctrineUserRepository::class);
    }

    public function test_should_restore_every_field_when_a_saved_user_is_read_back(): void
    {
        $user = $this->newUser('junta@club.es');
        $user->disable();
        $this->repository->save($user);
        $this->clearIdentityMap();

        $found = $this->repository->find($user->id());

        self::assertNotNull($found);
        self::assertTrue($found->id()->equals($user->id()));
        self::assertSame('junta@club.es', $found->email()->value);
        self::assertSame('Lucía Moreno Gil', $found->fullName()->value);
        self::assertSame(Role::Teacher, $found->role());
        self::assertSame('hash-1', $found->passwordHash()->value);
        self::assertSame(AccountStatus::Disabled, $found->status());
        self::assertTrue($found->mustChangePassword());
        self::assertEquals($user->createdAt(), $found->createdAt());
    }

    public function test_should_find_by_email_and_persist_later_changes(): void
    {
        $user = $this->newUser('profe@club.es');
        $this->repository->save($user);

        $user->changePassword(new PasswordHash('hash-2'), new DateTimeImmutable('2026-10-03 09:00:00+02:00'));
        $this->repository->save($user);
        $this->clearIdentityMap();

        $found = $this->repository->findByEmail(EmailAddress::fromString('PROFE@club.es'));
        self::assertSame('hash-2', $found?->passwordHash()->value);
        self::assertFalse($found->mustChangePassword());
    }

    public function test_should_return_null_when_the_user_does_not_exist(): void
    {
        self::assertNull($this->repository->find(UserId::generate()));
        self::assertNull($this->repository->findByEmail(EmailAddress::fromString('nadie@club.es')));
    }

    private function newUser(string $email): User
    {
        return User::register(UserId::generate(), EmailAddress::fromString($email), FullName::fromString('Lucía Moreno Gil'), Role::Teacher, new PasswordHash('hash-1'), new DateTimeImmutable('2026-10-02 10:00:00+02:00'));
    }

    private function clearIdentityMap(): void
    {
        self::getContainer()->get(EntityManagerInterface::class)->clear();
    }
}
