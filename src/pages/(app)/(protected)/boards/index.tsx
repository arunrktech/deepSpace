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

  async function createBoard() {
    const trimmed = name.trim()
    if (!trimmed) return
    try {
      // Confirmed: wait for the server to accept before opening the board.
      const id = await createConfirmed({ name: trimmed })
      setName('')
      navigate(`/boards/${id}`)
    } catch (e) {
      error('Could not create board', String(e))
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
        <Button type="submit" disabled={!name.trim()}>Create board</Button>
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
