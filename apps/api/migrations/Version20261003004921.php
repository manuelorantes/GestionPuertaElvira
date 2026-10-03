<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20261003004921 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Profesorado: sesiones impartidas, liquidaciones pagadas y meses propuestos';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE payroll_proposed_month (month VARCHAR(7) NOT NULL, PRIMARY KEY (month))');
        $this->addSql('CREATE TABLE payroll_session (id UUID NOT NULL, teacher_id UUID NOT NULL, session_date DATE NOT NULL, group_id UUID DEFAULT NULL, label VARCHAR(80) NOT NULL, minutes SMALLINT NOT NULL, from_schedule BOOLEAN NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX payroll_session_date_idx ON payroll_session (session_date)');
        $this->addSql('CREATE TABLE payroll_settlement (teacher_id UUID NOT NULL, month VARCHAR(7) NOT NULL, minutes INT NOT NULL, rate_cents INT NOT NULL, amount_cents INT NOT NULL, lines JSON NOT NULL, paid_on DATE NOT NULL, PRIMARY KEY (teacher_id, month))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE payroll_proposed_month');
        $this->addSql('DROP TABLE payroll_session');
        $this->addSql('DROP TABLE payroll_settlement');
    }
}
