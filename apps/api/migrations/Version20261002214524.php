<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Alumnado.
 */
final class Version20261002214524 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Alumnado';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE students_student (id UUID NOT NULL, full_name VARCHAR(120) NOT NULL, search_name VARCHAR(120) NOT NULL, birth_date DATE NOT NULL, national_id VARCHAR(9) DEFAULT NULL, contact_email VARCHAR(254) DEFAULT NULL, guardians JSON NOT NULL, own_phone VARCHAR(12) DEFAULT NULL, federation_licence VARCHAR(20) DEFAULT NULL, image_consent BOOLEAN NOT NULL, joined_on DATE NOT NULL, withdrawn_on DATE DEFAULT NULL, sibling_ids JSON NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX students_student_search_idx ON students_student (search_name)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE students_student');
    }
}
