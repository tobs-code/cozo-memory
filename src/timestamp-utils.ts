/**
 * Utility functions for timestamp handling
 * Provides both Unix microsecond timestamps and ISO 8601 strings
 */

export interface DualTimestamp {
  timestamp: number;      // Unix microseconds (CozoDB format)
  iso: string;           // ISO 8601 string (human-readable)
}

/**
 * Convert CozoDB microsecond timestamp to dual format
 */
export function toDualTimestamp(microseconds: number): DualTimestamp {
  const milliseconds = Math.floor(microseconds / 1000);
  const date = new Date(milliseconds);
  
  return {
    timestamp: microseconds,
    iso: date.toISOString()
  };
}

/**
 * Get current time in dual format
 */
export function nowDual(): DualTimestamp {
  const now = Date.now();
  return {
    timestamp: now * 1000, // Convert to microseconds
    iso: new Date(now).toISOString()
  };
}

/**
 * Parse ISO string or Unix timestamp to dual format
 */
export function parseToDual(input: string | number): DualTimestamp {
  if (typeof input === 'number') {
    return toDualTimestamp(input);
  }
  
  const date = new Date(input);
  const milliseconds = date.getTime();
  
  return {
    timestamp: milliseconds * 1000, // Convert to microseconds
    iso: date.toISOString()
  };
}
