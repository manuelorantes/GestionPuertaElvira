import { describe, expect, it } from 'vitest';

import { DEFAULT_MONTHS, expectedMonthsLabel, SEASON_ORDER } from './expectedMonths';

describe('expectedMonthsLabel', () => {
  it('should name the whole year, a run of months or a list', () => {
    expect(expectedMonthsLabel(SEASON_ORDER)).toBe('Todo el año');
    expect(expectedMonthsLabel(DEFAULT_MONTHS)).toBe('De septiembre a junio');
    expect(expectedMonthsLabel([6, 9, 10])).toBe('Septiembre, octubre y junio');
    expect(expectedMonthsLabel([1])).toBe('Enero');
  });
});
