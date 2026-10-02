<?php

declare(strict_types=1);

namespace App\Application\Common\Port;

interface TransactionRunner
{
    /**
     * Ejecuta el trabajo de forma atómica: o se confirma entero o no queda nada.
     *
     * @template T
     *
     * @param callable(): T $work
     *
     * @return T
     */
    public function run(callable $work): mixed;
}
