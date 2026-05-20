import { describe, it, expect } from 'vitest';
import { fmtEUR, fmtShortDate, addDays, isoToday } from './format';

describe('format', () => {
  it('fmtEUR formats numbers with €', () => {
    expect(fmtEUR(1234.5)).toMatch(/1\.234,5/);
    expect(fmtEUR(null)).toBe('—');
  });

  it('fmtShortDate handles iso strings', () => {
    expect(fmtShortDate('2026-03-18')).toMatch(/18/);
    expect(fmtShortDate(null)).toBe('—');
    expect(fmtShortDate('not-a-date')).toBe('not-a-date');
  });

  it('addDays adds days correctly', () => {
    expect(addDays('2026-01-30', 5)).toBe('2026-02-04');
  });

  it('isoToday returns YYYY-MM-DD', () => {
    expect(isoToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
