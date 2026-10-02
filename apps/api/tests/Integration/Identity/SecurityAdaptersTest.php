<?php

declare(strict_types=1);

namespace App\Tests\Integration\Identity;

use App\Application\Identity\Error\TooManyLoginAttempts;
use App\Application\Identity\SessionToken;
use App\Domain\Identity\EmailAddress;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\PasswordPolicy;
use App\Domain\Identity\PlainPassword;
use App\Infrastructure\Identity\Security\RandomSessionTokenGenerator;
use App\Infrastructure\Identity\Security\RandomTemporaryPasswordGenerator;
use App\Infrastructure\Identity\Security\RateLimiterLoginAttemptLimiter;
use App\Infrastructure\Identity\Security\SymfonyPasswordHasher;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class SecurityAdaptersTest extends KernelTestCase
{
    public function test_should_verify_only_the_original_password_when_hashed(): void
    {
        $hasher = self::getContainer()->get(SymfonyPasswordHasher::class);

        $hash = $hasher->hash(PlainPassword::fromString('gambito-de-dama'));

        self::assertStringNotContainsString('gambito-de-dama', $hash->value);
        self::assertTrue($hasher->verify($hash, PlainPassword::fromString('gambito-de-dama')));
        self::assertFalse($hasher->verify($hash, PlainPassword::fromString('gambito-de-rey')));
        self::assertFalse($hasher->needsRehash($hash));
        self::assertFalse($hasher->verify(new PasswordHash('no-es-un-hash'), PlainPassword::fromString('x')));
    }

    public function test_should_generate_unpredictable_tokens_and_a_stable_sha256_digest(): void
    {
        $generator = new RandomSessionTokenGenerator();

        $first = $generator->generate();

        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $first->value);
        self::assertNotSame($first->value, $generator->generate()->value);
        self::assertSame(hash('sha256', $first->value), $generator->hash($first)->value);
        self::assertEquals($generator->hash(new SessionToken('x')), $generator->hash(new SessionToken('x')));
    }

    public function test_should_generate_temporary_passwords_that_satisfy_the_policy(): void
    {
        $generator = new RandomTemporaryPasswordGenerator();
        $owner = EmailAddress::fromString('junta@club.es');

        $password = $generator->generate();

        new PasswordPolicy()->assertAcceptable($password, $owner);
        self::assertMatchesRegularExpression('/^[a-hj-km-np-z2-9]{4}(-[a-hj-km-np-z2-9]{4}){3}$/', $password->reveal());
        self::assertNotSame($password->reveal(), $generator->generate()->reveal());
    }

    public function test_should_block_an_email_after_five_failures_until_reset(): void
    {
        $limiter = self::getContainer()->get(RateLimiterLoginAttemptLimiter::class);
        $email = EmailAddress::fromString('bloqueo-'.bin2hex(random_bytes(4)).'@club.es');

        for ($i = 0; $i < 5; ++$i) {
            $limiter->assertCanAttempt($email, '10.1.1.1');
            $limiter->recordFailure($email, '10.1.1.1');
        }

        try {
            $limiter->assertCanAttempt($email, '10.1.1.1');
            self::fail('Se esperaba TooManyLoginAttempts');
        } catch (TooManyLoginAttempts $blocked) {
            self::assertGreaterThan(0, $blocked->retryAfterSeconds);
            self::assertLessThanOrEqual(900, $blocked->retryAfterSeconds);
        }

        $limiter->reset($email);
        $limiter->assertCanAttempt($email, '10.1.1.1');
    }

    public function test_should_block_an_ip_after_thirty_failures_across_different_emails(): void
    {
        $limiter = self::getContainer()->get(RateLimiterLoginAttemptLimiter::class);
        $ip = '10.2.'.random_int(0, 255).'.'.random_int(0, 255);

        for ($i = 0; $i < 30; ++$i) {
            $limiter->recordFailure(EmailAddress::fromString("spray{$i}@club.es"), $ip);
        }

        $this->expectException(TooManyLoginAttempts::class);

        $limiter->assertCanAttempt(EmailAddress::fromString('otra@club.es'), $ip);
    }
}
