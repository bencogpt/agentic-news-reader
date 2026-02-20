/**
 * Gets today's date in ISO format (YYYY-MM-DD)
 */
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Gets yesterday's date in ISO format
 */
export function getYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * Gets date N days ago in ISO format
 */
export function getDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Gets the start of the current week (Monday) in ISO format
 */
export function getStartOfWeek(): string {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}

/**
 * Gets the start of last week (Monday) in ISO format
 */
export function getStartOfLastWeek(): string {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) - 7;
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}

/**
 * Gets the end of last week (Sunday) in ISO format
 */
export function getEndOfLastWeek(): string {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1) - 1;
  date.setDate(diff);
  return date.toISOString().split('T')[0];
}

/**
 * Resolves relative time expressions to absolute date ranges
 */
export function resolveTimeWindow(
  expression: string
): { start: string; end: string } | null {
  const lower = expression.toLowerCase().trim();
  const today = getToday();

  // Exact relative expressions
  if (lower === 'today') {
    return { start: today, end: today };
  }

  if (lower === 'yesterday') {
    const yesterday = getYesterday();
    return { start: yesterday, end: yesterday };
  }

  if (lower === 'this week') {
    return { start: getStartOfWeek(), end: today };
  }

  if (lower === 'last week') {
    return { start: getStartOfLastWeek(), end: getEndOfLastWeek() };
  }

  // "X days ago"
  const daysAgoMatch = lower.match(/(\d+)\s*days?\s*ago/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1], 10);
    const date = getDaysAgo(days);
    return { start: date, end: date };
  }

  // "last X days" or "past X days"
  const lastDaysMatch = lower.match(/(?:last|past)\s*(\d+)\s*days?/);
  if (lastDaysMatch) {
    const days = parseInt(lastDaysMatch[1], 10);
    return { start: getDaysAgo(days), end: today };
  }

  // "this month"
  if (lower === 'this month') {
    const date = new Date();
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    return { start: startOfMonth.toISOString().split('T')[0], end: today };
  }

  // Try to parse as a date
  const parsedDate = new Date(expression);
  if (!isNaN(parsedDate.getTime())) {
    const date = parsedDate.toISOString().split('T')[0];
    return { start: date, end: date };
  }

  // Return null if we couldn't parse
  return null;
}

/**
 * Formats a date for display
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Gets a human-readable time window description
 */
export function describeTimeWindow(start: string, end: string): string {
  const today = getToday();
  const yesterday = getYesterday();

  if (start === end) {
    if (start === today) return 'today';
    if (start === yesterday) return 'yesterday';
    return formatDate(start);
  }

  return `${formatDate(start)} to ${formatDate(end)}`;
}
