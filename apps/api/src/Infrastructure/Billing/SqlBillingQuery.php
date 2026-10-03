<?php

declare(strict_types=1);

namespace App\Infrastructure\Billing;

use App\Application\Billing\ChargeView;
use App\Application\Billing\PaymentDetail;
use App\Application\Billing\PaymentSummary;
use App\Application\Billing\Port\BillingQuery;
use App\Domain\Billing\Charge;
use App\Domain\Billing\ChargeId;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\PaymentId;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Persistence\Doctrine\Row;
use Doctrine\DBAL\Connection;
use Webmozart\Assert\Assert;

final readonly class SqlBillingQuery implements BillingQuery
{
    private const string GUARDIAN = "COALESCE(s.guardians::jsonb -> 0 ->> 'name', s.full_name)";
    private const string PHONE = "COALESCE(s.guardians::jsonb -> 0 ->> 'phone', s.own_phone, '')";

    public function __construct(private Connection $connection)
    {
    }

    public function charges(YearMonth $month, LocalDate $today): array
    {
        $season = Season::containing($month);
        $rows = $this->connection->fetchAllAssociative(
            'SELECT c.*, s.full_name, '.self::GUARDIAN.' AS guardian_name, '.self::PHONE.' AS guardian_phone, p.receipt_number
               FROM billing_charge c
               JOIN students_student s ON s.id = c.student_id
               LEFT JOIN billing_payment p ON p.id = c.paid_by
              WHERE (c.kind = :monthly AND c.period = :month)
                 OR (c.kind = :membership AND c.period = :seasonStart AND (c.paid_by IS NULL OR :month = :seasonStart))
              ORDER BY s.search_name, c.kind DESC',
            ['monthly' => ChargeKind::Monthly->value, 'membership' => ChargeKind::Membership->value, 'month' => $month->toString(), 'seasonStart' => $season->firstMonth()->toString()],
        );

        return array_map(static function (array $values) use ($today): ChargeView {
            $row = new Row($values);
            $remindedOn = $row->nullableString('reminded_on');
            $charge = Charge::restore(
                ChargeId::fromString($row->string('id')),
                StudentRef::fromString($row->string('student_id')),
                ChargeKind::from($row->string('kind')),
                YearMonth::fromString($row->string('period')),
                Money::cents($row->int('amount_cents')),
                null === $row->nullableString('paid_by') ? null : PaymentId::fromString($row->string('paid_by')),
                null === $remindedOn ? null : LocalDate::fromString($remindedOn),
            );

            return new ChargeView(
                $charge->id()->value,
                $charge->student()->value,
                $row->string('full_name'),
                $row->string('guardian_name'),
                $row->string('guardian_phone'),
                $charge->kind()->value,
                $charge->period()->toString(),
                $charge->amount()->cents,
                $charge->statusOn($today)->value,
                $charge->paidBy()?->value,
                $row->nullableString('receipt_number'),
                $remindedOn,
            );
        }, $rows);
    }

    public function payments(?string $studentId): array
    {
        $rows = $this->connection->fetchAllAssociative(
            'SELECT p.*, s.full_name FROM billing_payment p JOIN students_student s ON s.id = p.student_id
              WHERE (:student::uuid IS NULL OR p.student_id = :student::uuid)
              ORDER BY p.paid_on DESC, p.receipt_number DESC',
            ['student' => $studentId],
        );

        return array_map(static fn (array $values): PaymentSummary => self::summary(new Row($values)), $rows);
    }

    public function payment(string $id): ?PaymentDetail
    {
        $values = $this->connection->fetchAssociative(
            'SELECT p.*, s.full_name, '.self::GUARDIAN.' AS guardian_name FROM billing_payment p JOIN students_student s ON s.id = p.student_id WHERE p.id = :id',
            ['id' => $id],
        );
        if (false === $values) {
            return null;
        }

        $row = new Row($values);
        $lines = json_decode($row->string('lines'), true, flags: \JSON_THROW_ON_ERROR);
        Assert::isList($lines);
        $invoice = null === $row->nullableString('invoice') ? null : json_decode($row->string('invoice'), true, flags: \JSON_THROW_ON_ERROR);
        Assert::nullOrIsArray($invoice);
        /** @var array<string, mixed>|null $invoice */

        return new PaymentDetail(
            self::summary($row),
            $row->string('guardian_name'),
            array_map(static function (mixed $line): array {
                Assert::isArray($line);
                Assert::string($line['label'] ?? null);
                Assert::integer($line['amountCents'] ?? null);

                return ['label' => $line['label'], 'amountCents' => $line['amountCents']];
            }, $lines),
            $row->stringListFromJson('periods'),
            $invoice,
        );
    }

    private static function summary(Row $row): PaymentSummary
    {
        return new PaymentSummary(
            $row->string('id'),
            $row->string('receipt_number'),
            $row->string('paid_on'),
            $row->string('student_id'),
            $row->string('full_name'),
            $row->string('kind'),
            $row->string('concept'),
            $row->string('method'),
            $row->int('total_cents'),
            $row->nullableString('invoice_number'),
        );
    }
}
