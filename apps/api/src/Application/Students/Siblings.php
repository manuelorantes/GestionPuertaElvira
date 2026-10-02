<?php

declare(strict_types=1);

namespace App\Application\Students;

use App\Application\Students\Port\StudentRepository;

/** La relación de hermanos es mutua: se actualizan siempre los dos alumnos. */
final readonly class Siblings
{
    public static function link(StudentRepository $students, string $a, string $b): void
    {
        $first = StudentLookup::byId($students, $a);
        $second = StudentLookup::byId($students, $b);
        $first->addSibling($second->id());
        $second->addSibling($first->id());
        $students->save($first);
        $students->save($second);
    }

    public static function unlink(StudentRepository $students, string $a, string $b): void
    {
        $first = StudentLookup::byId($students, $a);
        $second = StudentLookup::byId($students, $b);
        $first->removeSibling($second->id());
        $second->removeSibling($first->id());
        $students->save($first);
        $students->save($second);
    }
}
