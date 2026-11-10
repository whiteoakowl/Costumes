import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDate, fmtDateTime, fmtWeekdayDate, nyDayOf } from '../src/data/time';
import { formatDate, formatDateTime, formatTime } from '../src/data/selectors';

describe('dates are MM/DD/YYYY and times are New York Eastern', () => {
  it('formats calendar dates as MM/DD/YYYY', () => {
    expect(fmtDate('1984-12-15')).toBe('12/15/1984');
    expect(formatDate('2026-03-05')).toBe('03/05/2026');
    expect(fmtWeekdayDate('1984-12-15')).toBe('Sat 12/15/1984');
    expect(fmtDate('')).toBe('');
  });
  it('converts timestamps to Eastern time with EST / EDT, regardless of the computer’s time zone', () => {
    // 03:30 UTC on Jan 1 is 10:30 PM the previous evening in New York (EST).
    expect(fmtDateTime('2026-01-01T03:30:00.000Z')).toBe('12/31/2025 10:30 PM EST');
    expect(fmtDate('2026-01-01T03:30:00.000Z')).toBe('12/31/2025');
    expect(nyDayOf('2026-01-01T03:30:00.000Z')).toBe('2025-12-31');
    // Summer: daylight time.
    expect(formatDateTime('2026-07-01T16:00:00Z')).toBe('07/01/2026 12:00 PM EDT');
  });
  it('shows studio wall-clock times as entered (they are already Eastern)', () => {
    expect(fmtClock('16:30')).toBe('4:30 PM');
    expect(formatTime('00:05')).toBe('12:05 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
    expect(fmtDateTime('2026-12-13T16:00')).toBe('12/13/2026 4:00 PM');
  });
});
