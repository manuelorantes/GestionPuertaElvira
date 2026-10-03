import { formatCents, monthLabel, reminderText, shiftMonth, whatsappLink } from './money';

describe('billing formatting', () => {
  it('formats cents as euros in Spanish style', () => {
    expect(formatCents(4500)).toBe('45 €');
    expect(formatCents(123450)).toBe('1234,50 €');
    expect(formatCents(-1125)).toBe('−11,25 €');
  });

  it('labels and shifts months across years', () => {
    expect(monthLabel('2026-10')).toBe('Octubre 2026');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2027-01', -1)).toBe('2026-12');
  });

  it('prepares the WhatsApp reminder link', () => {
    const text = reminderText({
      guardianName: 'Rocío Herrera',
      studentName: 'Martina López Herrera',
      period: '2026-09',
      amountCents: 4050,
    });

    expect(text).toContain('Hola Rocío');
    expect(text).toContain('cuota de septiembre de Martina (40,50 €)');
    expect(whatsappLink('612 48 19 30', 'Hola')).toBe('https://wa.me/34612481930?text=Hola');
  });
});
