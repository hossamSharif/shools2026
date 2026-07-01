/**
 * SMS segment counting for Arabic (Unicode / UCS-2) messages (Article VII).
 *
 * Arabic falls outside GSM-7, so messages are encoded as UCS-2: 70 characters
 * per single segment, and 67 characters per segment once a message is split
 * (the 6-byte concatenation UDH consumes 3 UCS-2 chars per part). Credit is
 * decremented by this segment count atomically with the send.
 */
export const UCS2_SINGLE_SEGMENT = 70;
export const UCS2_MULTI_SEGMENT = 67;

/**
 * Count SMS segments for a message. Uses code points (not UTF-16 units) so
 * surrogate-pair emoji count as one character. An empty string is 1 segment.
 */
export function countSmsSegments(message: string): number {
  const length = [...message].length;
  if (length === 0) return 1;
  if (length <= UCS2_SINGLE_SEGMENT) return 1;
  return Math.ceil(length / UCS2_MULTI_SEGMENT);
}
