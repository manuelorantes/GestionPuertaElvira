<?php

declare(strict_types=1);

namespace App\Domain\Accounting;

use App\Domain\Common\InvalidValue;

enum LedgerCategory: string
{
    case Teachers = 'teachers';
    case Rent = 'rent';
    case Material = 'material';
    case Federation = 'federation';
    case Tournaments = 'tournaments';
    case Utilities = 'utilities';
    case OtherExpenses = 'other_expenses';
    case Fees = 'fees';
    case Membership = 'membership';
    case Grants = 'grants';
    case TournamentIncome = 'tournament_income';
    case OtherIncome = 'other_income';

    public static function fromName(string $name): self
    {
        return self::tryFrom($name) ?? throw new InvalidValue('category', 'Categoría desconocida.');
    }

    public function kind(): EntryKind
    {
        return match ($this) {
            self::Fees, self::Membership, self::Grants, self::TournamentIncome, self::OtherIncome => EntryKind::Income,
            default => EntryKind::Expense,
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Teachers => 'Profesores',
            self::Rent => 'Alquiler',
            self::Material => 'Material',
            self::Federation => 'Federación',
            self::Tournaments, self::TournamentIncome => 'Torneos',
            self::Utilities => 'Suministros',
            self::OtherExpenses => 'Otros gastos',
            self::Fees => 'Cuotas',
            self::Membership => 'Cuota de socio',
            self::Grants => 'Subvenciones',
            self::OtherIncome => 'Otros ingresos',
        };
    }
}
