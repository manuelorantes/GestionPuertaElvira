<?php

declare(strict_types=1);

namespace App\Application\Billing\Port;

use App\Domain\Billing\Payment;
use App\Domain\Billing\PaymentId;

interface PaymentRepository
{
    public function payment(PaymentId $id): ?Payment;

    public function savePayment(Payment $payment): void;
}
