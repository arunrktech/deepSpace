/**
 * /boards: every design board, and a form to start one.
 * Sign-in only (this folder is under (protected)). Docs: guides/data-storage.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutations, useQuery } from 'deepspace'
import { Button, EmptyState, Input, useToast } from '@/components/ui'
import type { BoardRow } from '../../../../board/fromRecords'

export default function BoardsPage() {
  const { records, status } = useQuery<BoardRow>('boards', { orderBy: 'createdAt', orderDir: 'desc' })
  const { createConfirmed } = useMutations<BoardRow>('boards')
  const navigate = useNavigate()
  const { error } = useToast()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  // Writes are only safe once the records connection has finished starting up.
  // A write made before that is silently lost: nothing is sent, nothing fails
  // (found by tests/board.spec.ts; diagnosis in NOTES.md, step 10). The query
  // reporting 'ready' is the signal that the connection is up.
  const ready = status === 'ready'

  async function createBoard() {
    const trimmed = name.trim()
    if (!trimmed || !ready || creating) return
    setCreating(true)
    try {
      // Confirmed: wait for the server to accept before opening the board.
      const id = await createConfirmed({ name: trimmed })
      setName('')
      navigate(`/boards/${id}`)
    } catch (e) {
      error('Could not create board', String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">Design boards</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Everyone signed in can edit every board. Changes appear for everyone as they happen.
      </p>

      <form
        className="mt-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void createBoard()
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" maxLength={120} />
        <Button type="submit" disabled={!ready || !name.trim() || creating} loading={creating}>
          {ready ? 'Create board' : 'Connecting…'}
        </Button>
      </form>

      {status === 'loading' ? (
        <p className="mt-8 text-sm text-muted-foreground">Loading boards…</p>
      ) : records.length === 0 ? (
        <EmptyState title="No boards yet" description="Create one above to start designing." />
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-lg border border-border">
          {records.map((b) => (
            <li key={b.recordId}>
              <Link to={`/boards/${b.recordId}`} className="block px-4 py-3 hover:bg-accent">
                {b.data.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
