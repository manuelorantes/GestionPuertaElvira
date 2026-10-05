<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Intentos de acceso fallidos de la API en Deno (ver specs/decisions/backend-en-deno-sobre-supabase.md):
 * ventanas de 15 minutos por email (hash) y por IP. La API en PHP sigue usando cache_items mientras conviven.
 */
final class Version20261005120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Tabla identity_login_attempt para el límite de intentos de la API en Deno';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE identity_login_attempt (key VARCHAR(80) NOT NULL, failures INT NOT NULL, window_started_at TIMESTAMP(0) WITH TIME ZONE NOT NULL, PRIMARY KEY (key))');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE identity_login_attempt');
    }
}
