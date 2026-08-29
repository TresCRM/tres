const UNITS: [string, number][] = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 0) return 'in the future';

  for (const [unit, secs] of UNITS) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) {
      return `${count} ${unit}${count !== 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}
