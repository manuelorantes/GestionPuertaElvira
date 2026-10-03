<?php

declare(strict_types=1);

namespace App\Tests\Integration\Persistence\Billing;

use App\Application\Billing\GenerateMonthlyCharges;
use App\Application\Billing\IssueInvoice;
use App\Application\Billing\PaymentRequest;
use App\Application\Billing\RegisterPayment;
use App\Application\Billing\UpdateStudentAccount;
use App\Application\Classes\CreateClassGroup;
use App\Application\Classes\GroupInput;
use App\Application\Students\LinkSiblings;
use App\Application\Students\RegisterStudent;
use App\Application\Students\StudentInput;
use App\Application\Teachers\RegisterTeacher;
use App\Domain\Billing\BillingSettings;
use App\Domain\Billing\ChargeKind;
use App\Domain\Billing\ChargeStatus;
use App\Domain\Billing\StudentRef;
use App\Domain\Common\LocalDate;
use App\Domain\Common\Money;
use App\Domain\Common\Season;
use App\Domain\Common\YearMonth;
use App\Infrastructure\Billing\SqlBillingQuery;
use App\Infrastructure\Billing\SqlStudentDirectory;
use App\Infrastructure\Persistence\Doctrine\Repository\Billing\DoctrineBillingSettingsRepository;
use App\Infrastructure\Persistence\Doctrine\Repository\Billing\DoctrineChargeRepository;
use App\Infrastructure\Persistence\Doctrine\Repository\Billing\DoctrineStudentAccountRepository;
use App\Infrastructure\Persistence\Doctrine\Repository\Billing\SqlDocumentSequence;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

final class BillingPersistenceTest extends KernelTestCase
{
    private string $teacher;
    private string $regular;
    private string $private;

    protected function setUp(): void
    {
        $c = self::getContainer();
        $this->teacher = $c->get(RegisterTeacher::class)('Lucía Moreno Gil');
        $this->regular = $c->get(CreateClassGroup::class)(new GroupInput('Iniciación A', 'beginner', $this->teacher, ['mon', 'wed'], '17:00', '18:00', 1, 12));
        $this->private = $c->get(CreateClassGroup::class)(new GroupInput('Particular', 'private_lesson', $this->teacher, ['fri'], '17:30', '19:00', 2, 2));
    }

    public function test_should_keep_default_settings_until_saved_and_then_restore_them(): void
    {
        $repository = self::getContainer()->get(DoctrineBillingSettingsRepository::class);
        self::assertSame(5500, $repository->get()->tariff->threeHours->cents);

        $repository->saveSettings(BillingSettings::defaults()->withPrivateRates([$this->teacher => Money::euros(28)]));
        $this->clear();

        self::assertSame(2800, $repository->get()->privateRateFor($this->teacher)->cents);
    }

    public function test_should_build_the_billing_profile_from_groups_and_siblings(): void
    {
        $martina = $this->register('Martina López Herrera', [$this->regular, $this->private]);
        $pablo = $this->register('Pablo López Herrera', [$this->regular]);
        self::getContainer()->get(LinkSiblings::class)($martina, $pablo);

        $profile = self::getContainer()->get(SqlStudentDirectory::class)->find(StudentRef::fromString($martina), $this->today());

        self::assertNotNull($profile);
        self::assertSame(2.0, $profile->regularWeeklyHours);
        self::assertTrue($profile->hasSiblings);
        self::assertSame('Rocío Herrera', $profile->guardianName);
        self::assertCount(1, $profile->privateLessons);
        self::assertSame(1.5, $profile->privateLessons[0]->weeklyHours);
        self::assertSame($this->teacher, $profile->privateLessons[0]->teacherId);
        self::assertCount(2, self::getContainer()->get(SqlStudentDirectory::class)->activeIn(YearMonth::of($this->today())));
    }

    public function test_should_number_documents_without_gaps_per_prefix_and_season(): void
    {
        $sequence = self::getContainer()->get(SqlDocumentSequence::class);

        self::assertSame([1, 2, 1, 1], [$sequence->next('R', 2026), $sequence->next('R', 2026), $sequence->next('F', 2026), $sequence->next('R', 2027)]);
    }

    public function test_should_generate_charges_register_a_payment_and_list_them(): void
    {
        $c = self::getContainer();
        $martina = $this->register('Martina López Herrera', [$this->regular]);
        $c->get(UpdateStudentAccount::class)($martina, 'three_months', true, null);
        $month = YearMonth::of($this->today());
        if (null === Season::teachingSeason($month)) {
            self::markTestSkipped('En julio y agosto no se generan cuotas.');
        }
        $c->get(GenerateMonthlyCharges::class)($month->toString());

        $paymentId = $c->get(RegisterPayment::class)(new PaymentRequest($martina, 'monthly', 1, 'cash', $this->today()->toString(), false, null, null));
        $c->get(IssueInvoice::class)($paymentId, 'Rocío Herrera', '12345678z', 'Calle Elvira 1, Granada');
        $this->clear();

        $charge = $c->get(DoctrineChargeRepository::class)->chargeFor(StudentRef::fromString($martina), ChargeKind::Monthly, $month);
        self::assertTrue($charge?->isPaid());
        self::assertSame(3, $c->get(DoctrineStudentAccountRepository::class)->account(StudentRef::fromString($martina))?->preferredPlan()->monthsWithin(10));

        $query = $c->get(SqlBillingQuery::class);
        $rows = $query->charges($month, $this->today());
        self::assertSame(['monthly', 'membership'], array_map(static fn ($r): string => $r->kind, $rows));
        self::assertSame(ChargeStatus::Paid->value, $rows[0]->status);
        self::assertSame('Martina López Herrera', $rows[0]->studentName);
        self::assertSame('612 48 19 30', $rows[0]->guardianPhone);

        $payments = $query->payments(null);
        self::assertCount(1, $payments);
        self::assertSame(4500, $payments[0]->totalCents);
        self::assertMatchesRegularExpression('/^F-\d{4}-0001$/', (string) $payments[0]->invoiceNumber);

        $detail = $query->payment($paymentId);
        self::assertSame('Rocío Herrera', $detail?->guardianName);
        self::assertSame('12345678Z', $detail?->invoice['customerTaxId'] ?? null);
        self::assertSame(3719, $detail?->invoice['baseCents'] ?? null);
        self::assertCount(1, $query->payments($martina));
    }

    private function clear(): void
    {
        self::getContainer()->get(EntityManagerInterface::class)->clear();
    }

    /** @param list<string> $groups */
    private function register(string $name, array $groups): string
    {
        $input = new StudentInput($name, '2014-03-12', null, 'familia@ejemplo.com', [['name' => 'Rocío Herrera', 'phone' => '612481930']], null, null, true);

        return self::getContainer()->get(RegisterStudent::class)($input, $groups, [], false);
    }

    private function today(): LocalDate
    {
        return LocalDate::fromInstant(new DateTimeImmutable());
    }
}
