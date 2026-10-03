<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261003004351 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Profesorado: tarifa por hora';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE teachers_teacher ADD hourly_rate_cents INT DEFAULT 1500 NOT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE teachers_teacher DROP hourly_rate_cents');
    }
}
