const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * "2026-07-15T…" → "July 15, 2026" — warm parent-facing copy, never raw ISO
 * (§7). Slices the ISO fields directly: no date lib, and no Date.parse timezone
 * drift shifting the kept-since day.
 *
 * Shared by the shelf and the world screen so a date never reads two ways.
 */
export function formatKeptSince(createdAt: string): string {
  const year = createdAt.slice(0, 4);
  const month = Number(createdAt.slice(5, 7));
  const day = Number(createdAt.slice(8, 10));
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}
