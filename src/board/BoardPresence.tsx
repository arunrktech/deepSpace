/**
 * Who else is on this board right now, and which component each person has
 * selected.
 *
 * Docs: https://docs.deep.space/guides/presence-and-cursors. usePresenceRoom
 * holds peer state in memory only (nothing stored); `peers` excludes me;
 * userId and userName come from the verified sign-in, so they can't be
 * spoofed. `peers` can start empty and fill in a moment later, so this
 * renders reactively.
 */
import { useEffect } from 'react'
import { getUserColor, usePresenceRoom } from 'deepspace'
import { Avatar, AvatarFallback } from '@/components/ui'
import { initials, type PeerSelection } from './BoardDiagram'

/** Join the board's presence room and broadcast my selection. */
export function useBoardPresence(boardId: string, selectedId: string | null) {
  const { peers, connected, updateState } = usePresenceRoom(`board:${boardId}`)

  // Re-send after reconnecting too: a rejoin starts with empty state (docs).
  useEffect(() => {
    if (connected) updateState({ selected: selectedId })
  }, [connected, selectedId, updateState])

  const selections: PeerSelection[] = peers.flatMap((p) =>
    typeof p.state.selected === 'string'
      ? [{ userId: p.userId, userName: p.userName, color: getUserColor(p.userId), componentId: p.state.selected }]
      : [],
  )
  return { peers, connected, selections }
}

export function PresenceStrip({ peers, connected }: Pick<ReturnType<typeof useBoardPresence>, 'peers' | 'connected'>) {
  // The same person in two tabs shows twice in `peers` (one entry per connection).
  const others = peers.length
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-muted-foreground'}`} aria-hidden />
      <span>{connected ? (others ? `${others} other${others === 1 ? '' : 's'} here` : 'Only you here') : 'Reconnecting…'}</span>
      <div className="flex -space-x-2">
        {peers.slice(0, 6).map((p, i) => (
          <Avatar key={`${p.userId}-${i}`} className="h-6 w-6 border-2 border-background" title={p.userName}>
            <AvatarFallback className="text-[10px] text-white" style={{ backgroundColor: getUserColor(p.userId) }}>
              {initials(p.userName)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
    </div>
  )
}
