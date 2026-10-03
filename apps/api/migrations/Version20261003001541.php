<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261003001541 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Cobros: ajustes, cuentas de alumno, cuotas, cobros y numeración de documentos';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE billing_account (student_id UUID NOT NULL, preferred_plan VARCHAR(20) NOT NULL, member BOOLEAN NOT NULL, private_rate_cents INT DEFAULT NULL, points INT NOT NULL, PRIMARY KEY (student_id))');
        $this->addSql('CREATE TABLE billing_charge (id UUID NOT NULL, student_id UUID NOT NULL, kind VARCHAR(12) NOT NULL, period VARCHAR(7) NOT NULL, amount_cents INT NOT NULL, paid_by UUID DEFAULT NULL, reminded_on DATE DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX billing_charge_period_idx ON billing_charge (period)');
        $this->addSql('CREATE UNIQUE INDEX billing_charge_unique ON billing_charge (student_id, kind, period)');
        $this->addSql('CREATE TABLE billing_document_sequence (prefix VARCHAR(1) NOT NULL, season_year SMALLINT NOT NULL, last_value INT NOT NULL, PRIMARY KEY (prefix, season_year))');
        $this->addSql('CREATE TABLE billing_payment (id UUID NOT NULL, student_id UUID NOT NULL, paid_on DATE NOT NULL, method VARCHAR(10) NOT NULL, receipt_number VARCHAR(16) NOT NULL, kind VARCHAR(12) NOT NULL, concept VARCHAR(120) NOT NULL, lines JSON NOT NULL, total_cents INT NOT NULL, periods JSON NOT NULL, invoice_number VARCHAR(16) DEFAULT NULL, invoice JSON DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_6060FDAB0ADB74C ON billing_payment (receipt_number)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_6060FDA2DA68207 ON billing_payment (invoice_number)');
        $this->addSql('CREATE INDEX billing_payment_student_idx ON billing_payment (student_id)');
        $this->addSql('CREATE TABLE billing_settings (id VARCHAR(20) NOT NULL, data JSON NOT NULL, PRIMARY KEY (id))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE billing_account');
        $this->addSql('DROP TABLE billing_charge');
        $this->addSql('DROP TABLE billing_document_sequence');
        $this->addSql('DROP TABLE billing_payment');
        $this->addSql('DROP TABLE billing_settings');
    }
}
