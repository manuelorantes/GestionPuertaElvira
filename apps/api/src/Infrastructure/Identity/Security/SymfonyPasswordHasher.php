<?php

declare(strict_types=1);

namespace App\Infrastructure\Identity\Security;

use App\Application\Identity\Port\PasswordHasher;
use App\Domain\Identity\PasswordHash;
use App\Domain\Identity\PlainPassword;
use Symfony\Component\PasswordHasher\Hasher\PasswordHasherFactoryInterface;
use Symfony\Component\PasswordHasher\PasswordHasherInterface;

final readonly class SymfonyPasswordHasher implements PasswordHasher
{
    private PasswordHasherInterface $hasher;

    public function __construct(PasswordHasherFactoryInterface $factory)
    {
        // Configurado en security.yaml (password_hashers.identity).
        $this->hasher = $factory->getPasswordHasher('identity');
    }

    public function hash(PlainPassword $password): PasswordHash
    {
        return new PasswordHash($this->hasher->hash($password->reveal()));
    }

    public function verify(PasswordHash $hash, PlainPassword $password): bool
    {
        return $this->hasher->verify($hash->value, $password->reveal());
    }

    public function needsRehash(PasswordHash $hash): bool
    {
        return $this->hasher->needsRehash($hash->value);
    }
}
