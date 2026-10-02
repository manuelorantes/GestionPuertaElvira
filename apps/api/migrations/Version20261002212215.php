<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Profesorado, grupos e inscripciones.
 */
final class Version20261002212215 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Profesorado, grupos e inscripciones';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE classes_enrolment (id UUID NOT NULL, student_id UUID NOT NULL, class_group_id UUID NOT NULL, enrolled_on DATE NOT NULL, ends_on DATE DEFAULT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX classes_enrolment_student_idx ON classes_enrolment (student_id)');
        $this->addSql('CREATE INDEX classes_enrolment_group_idx ON classes_enrolment (class_group_id)');
        $this->addSql('CREATE TABLE classes_group (id UUID NOT NULL, name VARCHAR(60) NOT NULL, level VARCHAR(20) NOT NULL, teacher_id UUID NOT NULL, days JSON NOT NULL, start_minutes SMALLINT NOT NULL, end_minutes SMALLINT NOT NULL, classroom SMALLINT NOT NULL, capacity SMALLINT NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX classes_group_teacher_idx ON classes_group (teacher_id)');
        $this->addSql('CREATE TABLE teachers_teacher (id UUID NOT NULL, full_name VARCHAR(120) NOT NULL, active BOOLEAN NOT NULL, PRIMARY KEY (id))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE classes_enrolment');
        $this->addSql('DROP TABLE classes_group');
        $this->addSql('DROP TABLE teachers_teacher');
    }
}
