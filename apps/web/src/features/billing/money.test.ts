import { formatCents, monthLabel, reminderText, shiftMonth, whatsappLink } from './money';

describe('billing formatting', () => {
  it.each([
    [0, '0,00 €'],
    [4500, '45,00 €'],
    [4050, '40,50 €'],
    [7, '0,07 €'],
    [100000, '1.000,00 €'],
    [123450, '1.234,50 €'],
    [816300, '8.163,00 €'],
    [1259495, '12.594,95 €'],
    [123456700, '1.234.567,00 €'],
    [-1125, '−11,25 €'],
    [-163144, '−1.631,44 €'],
  ])('formats %i cents as %s, with thousands and two decimals', (cents, text) => {
    expect(formatCents(cents)).toBe(text);
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
