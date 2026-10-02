import { gridRows, groupsOn, halfHours, weeklyHours, formatHours } from './schedule';
import type { ClassGroup } from './api';

describe('schedule helpers', () => {
  it('should place a group on the half-hour grid rows', () => {
    expect(gridRows('16:00', '17:00')).toEqual({ rowStart: 1, rowEnd: 3 });
    expect(gridRows('19:30', '21:00')).toEqual({ rowStart: 8, rowEnd: 11 });
  });

  it('should list half hours and compute weekly hours', () => {
    expect(halfHours('16:00', '17:00')).toEqual(['16:00', '16:30', '17:00']);
    expect(weeklyHours(2, '18:00', '19:30')).toBe(3);
    expect(weeklyHours(1, '18:00', '17:00')).toBe(0);
    expect(formatHours(1.5)).toBe('1,5 h semanales');
  });

  it('should pick the groups that meet on a given day', () => {
    const monday = { id: 'a', days: ['mon', 'wed'] } as ClassGroup;
    const friday = { id: 'b', days: ['fri'] } as ClassGroup;

    expect(groupsOn('wed', [monday, friday])).toEqual([monday]);
  });
});
