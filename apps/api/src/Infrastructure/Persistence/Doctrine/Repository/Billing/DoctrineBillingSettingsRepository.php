<?php

declare(strict_types=1);

namespace App\Infrastructure\Persistence\Doctrine\Repository\Billing;

use App\Application\Billing\Port\BillingSettingsRepository;
use App\Domain\Billing\BillingSettings;
use App\Infrastructure\Persistence\Doctrine\Model\Billing\BillingSettingsRecord;
use Doctrine\ORM\EntityManagerInterface;

final readonly class DoctrineBillingSettingsRepository implements BillingSettingsRepository
{
    private const string ID = 'club';

    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function get(): BillingSettings
    {
        $record = $this->em->find(BillingSettingsRecord::class, self::ID);

        return null === $record ? BillingSettings::defaults() : BillingSettingsMapper::fromData($record->data);
    }

    public function saveSettings(BillingSettings $settings): void
    {
        $record = $this->em->find(BillingSettingsRecord::class, self::ID) ?? new BillingSettingsRecord(self::ID, []);
        $record->data = BillingSettingsMapper::toData($settings);
        $this->em->persist($record);
        $this->em->flush();
    }
}
