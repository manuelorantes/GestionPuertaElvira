import {
  equalShares,
  initialChoice,
  resolveChoice,
  sharesDetail,
  sharesLabel,
} from './periodShares';

describe('period shares', () => {
  it('splits an amount equally, the first months taking the spare cents', () => {
    expect(equalShares(10000, ['2026-12', '2026-10', '2026-11'])).toEqual([
      { period: '2026-10', amountCents: 3334 },
      { period: '2026-11', amountCents: 3333 },
      { period: '2026-12', amountCents: 3333 },
    ]);
  });

  it('resolves one month, several equally or several by hand, explaining what does not add up', () => {
    expect(resolveChoice({ kind: 'one', period: '' }, '2027-01', 9000)).toMatchObject({
      period: null,
      shares: null,
      effective: [{ period: '2027-01', amountCents: 9000 }],
    });
    const many = { kind: 'many' as const, months: ['2026-11', '2026-10'], amounts: null };
    expect(resolveChoice(many, '2027-01', 9000)).toMatchObject({
      period: '2026-10',
      shares: [
        { period: '2026-10', amountCents: 4500 },
        { period: '2026-11', amountCents: 4500 },
      ],
      problem: null,
    });
    expect(
      resolveChoice({ ...many, amounts: { '2026-10': '50', '2026-11': '30' } }, '2027-01', 9000)
        .problem,
    ).toBe('El reparto suma 80 € y el importe es 90 €.');
    expect(resolveChoice({ ...many, months: ['2026-10'] }, '2027-01', 9000).problem).toBe(
      'Elige al menos dos meses.',
    );
  });

  it('starts from what a movement already has', () => {
    expect(initialChoice([{ period: '2026-10', amountCents: 100 }], '2026-10', 100)).toEqual({
      kind: 'one',
      period: '',
    });
    expect(
      initialChoice(
        [
          { period: '2026-10', amountCents: 2000 },
          { period: '2026-11', amountCents: 7000 },
        ],
        '2027-01',
        9000,
      ),
    ).toEqual({
      kind: 'many',
      months: ['2026-10', '2026-11'],
      amounts: { '2026-10': '20', '2026-11': '70' },
    });
  });

  it('names the months, across years too', () => {
    const shares = ['2026-10', '2026-11', '2026-12'].map((period) => ({
      period,
      amountCents: 10000,
    }));
    expect(sharesLabel(shares)).toBe('octubre, noviembre y diciembre 2026');
    expect(
      sharesLabel([
        { period: '2027-01', amountCents: 1 },
        { period: '2026-12', amountCents: 1 },
      ]),
    ).toBe('diciembre 2026, enero 2027');
    expect(sharesDetail(shares.slice(0, 2))).toBe('Octubre 2026 (100 €), noviembre 2026 (100 €)');
  });
});
