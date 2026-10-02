<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Identity: cuentas, sesiones y almacén compartido del limitador de intentos.
 */
final class Version20261002202221 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Identity: cuentas, sesiones y almacén del limitador de intentos';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE identity_session (id UUID NOT NULL, token_hash VARCHAR(64) NOT NULL, user_id UUID NOT NULL, started_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, last_activity_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE INDEX identity_session_user_idx ON identity_session (user_id)');
        $this->addSql('CREATE UNIQUE INDEX identity_session_token_hash_unique ON identity_session (token_hash)');
        $this->addSql('CREATE TABLE identity_user (id UUID NOT NULL, email VARCHAR(254) NOT NULL, full_name VARCHAR(120) NOT NULL, role VARCHAR(20) NOT NULL, password_hash VARCHAR(255) NOT NULL, status VARCHAR(20) NOT NULL, must_change_password BOOLEAN NOT NULL, created_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, password_changed_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, PRIMARY KEY (id))');
        $this->addSql('CREATE UNIQUE INDEX identity_user_email_unique ON identity_user (email)');
        $this->addSql('CREATE TABLE cache_items (item_id VARCHAR(255) NOT NULL, item_data BYTEA NOT NULL, item_lifetime INT DEFAULT NULL, item_time INT NOT NULL, PRIMARY KEY (item_id))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE identity_session');
        $this->addSql('DROP TABLE identity_user');
        $this->addSql('DROP TABLE cache_items');
    }
}
