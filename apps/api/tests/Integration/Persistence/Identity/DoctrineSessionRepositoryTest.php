<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Identity;

use App\Domain\Identity\Session;
use App\Domain\Identity\SessionId;
use App\Domain\Identity\SessionTokenHash;
use App\Domain\Identity\UserId;
use App\Infrastructure\Persistence\Doctrine\Repository\Identity\DoctrineSessionRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class DoctrineSessionRepositoryTest extends KernelTestCase
{
    private DoctrineSessionRepository $repository;
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->repository = self::getContainer()->get(DoctrineSessionRepository::class);
        $this->now = new DateTimeImmutable('2026-10-02 10:00:00+02:00');
    }

    public function test_should_find_a_saved_session_by_its_token_hash_with_updated_activity(): void
    {
        $session = $this->newSession(UserId::generate(), 'a');
        $this->repository->save($session);
        $session->touch($this->now->modify('+5 minutes'));
        $this->repository->save($session);
        $this->clear();

        $found = $this->repository->findByTokenHash(new SessionTokenHash(str_repeat('a', 64)));

        self::assertTrue($found?->id()->equals($session->id()));
        self::assertEquals($this->now->modify('+5 minutes'), $found->lastActivityAt());
    }

    public function test_should_remove_one_session_or_all_of_a_user_except_the_given_one(): void
    {
        $user = UserId::generate();
        $keep = $this->newSession($user, 'b');
        $other = $this->newSession($user, 'c');
        $removed = $this->newSession($user, 'd');
        $foreign = $this->newSession(UserId::generate(), 'e');
        foreach ([$keep, $other, $removed, $foreign] as $session) {
            $this->repository->save($session);
        }

        $this->repository->remove($removed->id());
        $this->repository->removeAllForUser($user, except: $keep->id());
        $this->clear();

        self::assertNotNull($this->repository->findByTokenHash($keep->tokenHash()));
        self::assertNull($this->repository->findByTokenHash($other->tokenHash()));
        self::assertNull($this->repository->findByTokenHash($removed->tokenHash()));
        self::assertNotNull($this->repository->findByTokenHash($foreign->tokenHash()));
    }

    private function newSession(UserId $user, string $hashChar): Session
    {
        return Session::start(SessionId::generate(), new SessionTokenHash(str_repeat($hashChar, 64)), $user, $this->now);
    }

    private function clear(): void
    {
        self::getContainer()->get(EntityManagerInterface::class)->clear();
    }
}
