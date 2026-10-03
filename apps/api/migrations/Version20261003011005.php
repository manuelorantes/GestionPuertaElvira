<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261003011005 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Contabilidad: apuntes manuales, facturas de proveedores y cierres de temporada';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE accounting_closing (start_year SMALLINT NOT NULL, income_cents INT NOT NULL, expense_cents INT NOT NULL, closed_on DATE NOT NULL, PRIMARY KEY (start_year))');
        $this->addSql('CREATE TABLE accounting_entry (id UUID NOT NULL, entry_date DATE NOT NULL, kind VARCHAR(10) NOT NULL, concept VARCHAR(120) NOT NULL, category VARCHAR(20) NOT NULL, method VARCHAR(10) NOT NULL, amount_cents INT NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX accounting_entry_date_idx ON accounting_entry (entry_date)');
        $this->addSql('CREATE TABLE accounting_invoice (id UUID NOT NULL, invoice_date DATE NOT NULL, number VARCHAR(40) NOT NULL, supplier VARCHAR(120) NOT NULL, concept VARCHAR(120) NOT NULL, category VARCHAR(20) NOT NULL, amount_cents INT NOT NULL, paid_on DATE DEFAULT NULL, method VARCHAR(10) DEFAULT NULL, attachment_key VARCHAR(200) DEFAULT NULL, attachment_name VARCHAR(200) DEFAULT NULL, attachment_type VARCHAR(40) DEFAULT NULL, attachment_bytes INT DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX accounting_invoice_paid_idx ON accounting_invoice (paid_on)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE accounting_closing');
        $this->addSql('DROP TABLE accounting_entry');
        $this->addSql('DROP TABLE accounting_invoice');
    }
}
