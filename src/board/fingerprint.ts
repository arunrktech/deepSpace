/**
 * A short fingerprint of a board's content, so the page can tell whether the
 * latest AI review still matches the board ("Board changed since this
 * review"). The server stores it with the review; the page recomputes it
 * from the live records.
 *
 * Both sides build the Board with boardFromRecords from records ordered
 * oldest first, so the same content gives the same JSON and the same hash.
 * FNV-1a (32-bit) is plenty: this detects edits, it isn't security.
 */
import type { Board } from '../cost/board'

export function boardFingerprint(board: Board): string {
  const text = JSON.stringify({
    c: board.components.map((c) => [c.id, c.type, c.label ?? '', c.sizing ?? {}]),
    f: board.flows ?? [],
    e: board.egress_gb ?? null,
  })
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
