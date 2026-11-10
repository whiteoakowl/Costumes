/**
 * Studio date & time rules — used everywhere in the app:
 *
 *  - Dates are shown as MM/DD/YYYY (e.g. 12/15/1984).
 *  - Times are New York Eastern time (America/New_York), whatever the
 *    device's own time zone. Timestamps (logs, "printed at", activity) are
 *    converted to Eastern time and labelled EST / EDT.
 *  - "Today" is the current date in New York.
 *  - Class, rehearsal and performance times entered in the app are studio
 *    wall-clock times, i.e. already Eastern; they are shown as entered.
 *
 * Dates are still stored as YYYY-MM-DD and timestamps as ISO/UTC so sorting
 * and comparisons keep working.
 */

export const STUDIO_TIME_ZONE = 'America/New_York';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
  timeZoneName: 'short',
});

/** Calendar parts of an instant, in New York time. */
export function nyParts(d: Date = new Date()) {
  const get = (t: string) => partsFmt.formatToParts(d).find((p) => p.type === t)?.value ?? '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === '24' ? '00' : get('hour'),
    minute: get('minute'),
    weekday: get('weekday'),
    zone: get('timeZoneName'), // EST or EDT
  };
}

/** Today's date in New York, as YYYY-MM-DD. */
export function nyToday(): string {
  const p = nyParts();
  return `${p.year}-${p.month}-${p.day}`;
}

/** Now in New York, as 'YYYY-MM-DDTHH:MM' (the format of datetime-local inputs). */
export function nyNowLocal(): string {
  const p = nyParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM' (24-hour) → '4:30 PM'. */
export function fmtClock(hhmm: string) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 || 12}:${pad(m || 0)} ${h < 12 ? 'AM' : 'PM'}`;
}

function isInstant(v: string) {
  // ISO timestamps carry a zone (Z or ±hh:mm); 'YYYY-MM-DDTHH:MM' is a studio wall-clock time.
  return /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v);
}

/** MM/DD/YYYY. Accepts 'YYYY-MM-DD', a studio 'YYYY-MM-DDTHH:MM', or an ISO timestamp (converted to New York). */
export function fmtDate(v: string) {
  if (!v) return '';
  if (isInstant(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const p = nyParts(d);
    return `${p.month}/${p.day}/${p.year}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : v;
}

/**
 * MM/DD/YYYY h:mm AM/PM ET.
 * ISO timestamps are converted to New York time and labelled EST/EDT;
 * studio wall-clock values ('YYYY-MM-DDTHH:MM') are shown as entered.
 */
export function fmtDateTime(v: string) {
  if (!v) return '';
  if (isInstant(v)) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const p = nyParts(d);
    return `${p.month}/${p.day}/${p.year} ${fmtClock(`${p.hour}:${p.minute}`)} ${p.zone}`;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(v);
  if (!m) return v;
  return `${m[2]}/${m[3]}/${m[1]}${m[4] ? ` ${fmtClock(m[4])}` : ''}`;
}

/** 'Tue 12/15/1984'. */
export function fmtWeekdayDate(ymd: string) {
  if (!ymd) return '';
  const [y, mo, d] = ymd.slice(0, 10).split('-').map(Number);
  const wd = new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return `${wd} ${fmtDate(ymd)}`;
}

/** Local calendar day (New York) of an ISO timestamp, as YYYY-MM-DD. */
export function nyDayOf(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = nyParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Abbreviation for the current Eastern offset (EST in winter, EDT in summer). */
export function nyZoneName(d: Date = new Date()) {
  return nyParts(d).zone;
}

/** 'Tuesday 11/10/2026' for page headings (New York date). */
export function todayHeading() {
  const t = nyToday();
  const wd = new Date(`${t}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${wd} ${fmtDate(t)}`;
}
