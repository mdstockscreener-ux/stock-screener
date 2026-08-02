import { toApiDate } from './formatters';

export const PRESETS = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'Custom', 'Clear'];

export function getDateRange(preset, baseDate = new Date()) {
  const to = new Date(baseDate);
  to.setHours(0, 0, 0, 0);
  const from = new Date(to);

  switch (preset) {
    case '1D':
      from.setDate(from.getDate() - 1);
      break;
    case '1W':
      from.setDate(from.getDate() - 7);
      break;
    case '1M':
      from.setMonth(from.getMonth() - 1);
      break;
    case '3M':
      from.setMonth(from.getMonth() - 3);
      break;
    case '6M':
      from.setMonth(from.getMonth() - 6);
      break;
    case '1Y':
      from.setFullYear(from.getFullYear() - 1);
      break;
    case '5Y':
      from.setFullYear(from.getFullYear() - 5);
      break;
    default:
      return null;
  }

  return { from: toApiDate(from), to: toApiDate(to) };
}

export function apiDateToInput(isoParts) {
  const [d, m, y] = isoParts.split('-');
  if (!d || !m || !y) return '';
  return `${y}-${m}-${d}`;
}

export function inputDateToApi(iso) {
  const [y, m, d] = iso.split('-');
  if (!d || !m || !y) return '';
  return `${d}-${m}-${y}`;
}
