/**
 * /boards/:boardId: edit one design board together.
 *
 * Data: three collections filtered by boardId on the server
 * (docs: sdk-reference/client/records, `where`). Writes go through
 * useMutations; every client re-renders when the server broadcasts the change
 * (docs: concepts/realtime-sync), so there is no local copy to keep in step.
 *
 * Text and number fields save on blur or Enter, not on every keystroke, so a
 * half-typed value isn't broadcast to everyone.
 *
 * Controls use the scaffold's UI kit (Select, Tabs, ConfirmModal), never
 * browser-default widgets (docs: design/product-polish).
 */
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutations, useQuery } from 'deepspace'
import {
  Button, ConfirmModal, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui'
import { COMPONENT_TYPES, DEFAULT_SIZING, LABEL, type ComponentType } from '../../../../cost/board'
import { compute } from '../../../../cost/costModel'
import { boardToPrices } from '../../../../cost/quantify'
import { boardFromRecords, type BoardRow, type ComponentRow, type FlowRow } from '../../../../board/fromRecords'
import { fieldsFor, specFor } from '../../../../board/fields'
import { CostPanel } from '../../../../board/CostPanel'
import { ReviewPanel, findingCounts, type ReviewRow } from '../../../../board/ReviewPanel'
import { boardFingerprint } from '../../../../board/fingerprint'
import { BoardDiagram } from '../../../../board/BoardDiagram'
import { PresenceStrip, useBoardPresence } from '../../../../board/BoardPresence'

/** Select values must be non-empty, so "use the default" is this sentinel. */
const DEFAULT_CHOICE = '__default__'

export default function BoardPage() {
  const { boardId = '' } = useParams()
  const boards = useQuery<BoardRow>('boards')
  const components = useQuery<ComponentRow>('components', { where: { boardId }, orderBy: 'createdAt', orderDir: 'asc' })
  const flows = useQuery<FlowRow>('flows', { where: { boardId }, orderBy: 'createdAt', orderDir: 'asc' })
  // Only the latest review is shown, so only the latest is sent.
  const reviews = useQuery<ReviewRow>('reviews', { where: { boardId }, orderBy: 'createdAt', orderDir: 'desc', limit: 1 })
  const boardMut = useMutations<BoardRow>('boards')
  const compMut = useMutations<ComponentRow>('components')
  const flowMut = useMutations<FlowRow>('flows')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState(false)
  const navigate = useNavigate()
  const presence = useBoardPresence(boardId, selectedId)

  const board = boards.records.find((b) => b.recordId === boardId)
  const selected = components.records.find((c) => c.recordId === selectedId)
  // Adding is only safe once the records connection has finished starting up:
  // a write made earlier is silently lost (see boards/index.tsx and NOTES.md,
  // step 10). Editing, dragging and deleting need a loaded component, so they
  // can't happen before this anyway.
  const ready = components.status === 'ready' && flows.status === 'ready'

  // The live cost: recalculated in this browser whenever any synced record
  // changes. Every viewer has the same records and the same price snapshot,
  // so every viewer sees the same numbers, and nothing is stored.
  const { cost, fingerprint } = useMemo(() => {
    const shaped = boardFromRecords(board, components.records, flows.records)
    const { prices, workload } = boardToPrices(shaped)
    // The fingerprint tells the review panel whether the board changed since the last review.
    return { cost: compute(prices, workload), fingerprint: boardFingerprint(shaped) }
  }, [board, components.records, flows.records])
  const latestReview = reviews.records[0]
  const counts = findingCounts(latestReview?.data.findings)
  const labelOf = (id: string) =>
    id === 'internet-egress'
      ? 'Internet egress'
      : components.records.find((c) => c.recordId === id)?.data.label || '(removed component)'

  if (boards.status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-6 py-8" aria-busy="true">
        <div className="h-10 w-1/3 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }
  if (!board) {
    return (
      <div className="p-6 text-sm">
        Board not found. <Link to="/boards" className="underline">Back to boards</Link>
      </div>
    )
  }

  function addComponent(type: ComponentType) {
    const n = components.records.filter((c) => c.data.type === type).length + 1
    // x/y 0,0 = "not placed yet": the diagram lays it out in its layer's column.
    const id = compMut.create({ boardId, type, label: `${LABEL[type]} ${n}`, x: 0, y: 0 })
    void id.then(setSelectedId)
  }

  /**
   * Delete the whole board: flows, then components, then the board record,
   * one write at a time (no transactions in the records layer). Reviews stay:
   * members can't delete them by design (only the server writes reviews), and
   * with the board gone nothing shows them.
   */
  function deleteBoard() {
    for (const f of flows.records) flowMut.remove(f.recordId)
    for (const c of components.records) compMut.remove(c.recordId)
    boardMut.remove(boardId)
    navigate('/boards')
  }

  function deleteComponent(id: string) {
    // No transactions in the records layer, so remove the flows first, then the component.
    for (const f of flows.records) {
      if (f.data.fromId === id || f.data.toId === id) flowMut.remove(f.recordId)
    }
    compMut.remove(id)
    if (selectedId === id) setSelectedId(null)
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 text-foreground">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-64 flex-1">
          <Label htmlFor="board-name">Board</Label>
          <SaveOnBlur
            id="board-name"
            value={board.data.name}
            onSave={(v) => v.trim() && boardMut.put(boardId, { name: v.trim() })}
            className="text-lg font-semibold"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setConfirmDeleteBoard(true)}>
          Delete board
        </Button>
        <div className="w-56">
          <Label htmlFor="egress">Internet egress to users (GB per month)</Label>
          <NumberSave
            id="egress"
            value={board.data.egress_gb ?? null}
            placeholder="200 (default)"
            onSave={(v) => boardMut.put(boardId, { egress_gb: v })}
          />
        </div>
      </div>
      <div className="mt-2">
        <PresenceStrip peers={presence.peers} connected={presence.connected} />
      </div>

      <div className="mt-6">
        <CostPanel result={cost} />
      </div>

      <div className="mt-6">
        <ReviewPanel boardId={boardId} review={latestReview} currentFingerprint={fingerprint} labelOf={labelOf} />
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Add a component</h2>
        <div className="flex flex-wrap gap-2">
          {COMPONENT_TYPES.map((t) => (
            <Button key={t} variant="outline" size="sm" disabled={!ready} onClick={() => addComponent(t)}>
              + {LABEL[t]}
            </Button>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="min-w-0">
          <Tabs defaultValue="diagram">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">Components ({components.records.length})</h2>
              <TabsList>
                <TabsTrigger value="diagram">Diagram</TabsTrigger>
                <TabsTrigger value="list">List</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="diagram">
              <BoardDiagram
                components={components.records}
                flows={flows.records}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMove={(moves) => moves.forEach((m) => compMut.put(m.id, { x: m.x, y: m.y }))}
                findingCounts={counts}
                summaryOf={sizingSummary}
                peerSelections={presence.selections}
              />
              <p className="mt-1 text-xs text-muted-foreground">Drag a box to move it for everyone. Click to edit.</p>
            </TabsContent>
            <TabsContent value="list">
              {components.records.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                  Nothing here yet. Add a service, database or any other component above.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {components.records.map((c) => {
                    const count = counts.get(c.recordId)
                    return (
                      <li key={c.recordId}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(c.recordId)}
                          className={`w-full rounded-lg border p-3 text-left hover:bg-accent ${
                            c.recordId === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                            <span>{LABEL[c.data.type as ComponentType] ?? c.data.type}</span>
                            {count && (
                              <span
                                className={`rounded px-1.5 py-0.5 normal-case tracking-normal ${
                                  count.high ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {count.total} finding{count.total === 1 ? '' : 's'}
                              </span>
                            )}
                          </div>
                          <div className="font-medium">{c.data.label || '(unnamed)'}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{sizingSummary(c.data)}</div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </TabsContent>
          </Tabs>

          <FlowsEditor
            boardId={boardId}
            components={components.records}
            flows={flows.records}
            ready={ready}
            onAdd={(row) => flowMut.create(row)}
            onRemove={(id) => flowMut.remove(id)}
          />
        </section>

        <aside className="h-fit rounded-lg border border-border p-4 lg:sticky lg:top-4">
          {selected ? (
            <ComponentEditor
              key={selected.recordId}
              row={selected.data}
              onSave={(patch) => compMut.put(selected.recordId, patch)}
              onDelete={() => setConfirmDelete(true)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a component to edit its name and sizing.</p>
          )}
        </aside>
      </div>

      <ConfirmModal
        open={confirmDeleteBoard}
        onClose={() => setConfirmDeleteBoard(false)}
        onConfirm={() => {
          setConfirmDeleteBoard(false)
          deleteBoard()
        }}
        title={`Delete board "${board.data.name}"?`}
        description={`This removes the board and its ${components.records.length} component(s) and ${flows.records.length} flow(s) for everyone.`}
        confirmText="Delete board"
        variant="destructive"
      />

      <ConfirmModal
        open={confirmDelete && !!selected}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (selected) deleteComponent(selected.recordId)
          setConfirmDelete(false)
        }}
        title={`Delete "${selected?.data.label || 'component'}"?`}
        description="This removes it and its flows from the board for everyone."
        confirmText="Delete"
        variant="destructive"
      />
    </div>
  )
}

/** "count 2 · vcpu 4" from whichever sizing fields are set; blank ones use defaults. */
function sizingSummary(row: ComponentRow): string {
  const type = row.type as ComponentType
  if (!COMPONENT_TYPES.includes(type)) return ''
  const set = fieldsFor(type)
    .filter((f) => row[f] !== null && row[f] !== undefined && row[f] !== '')
    .map((f) => `${specFor(type, f).label} ${formatValue(row[f])}`)
  return set.length ? set.join(' · ') : 'Default sizing'
}

const formatValue = (v: unknown) => (v === true || v === 1 ? 'yes' : v === false || v === 0 ? 'no' : String(v))

function ComponentEditor({
  row,
  onSave,
  onDelete,
}: {
  row: ComponentRow
  onSave: (patch: Partial<ComponentRow>) => void
  onDelete: () => void
}) {
  const type = row.type as ComponentType
  const defaults: Record<string, unknown> = { ...DEFAULT_SIZING[type] }
  return (
    <div className="space-y-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{LABEL[type]}</div>
      <Field label="Name" htmlFor="comp-label">
        <SaveOnBlur id="comp-label" value={row.label ?? ''} onSave={(v) => onSave({ label: v.trim() })} />
      </Field>

      {fieldsFor(type).map((field) => {
        const spec = specFor(type, field)
        const id = `field-${field}`
        const label = 'unit' in spec && spec.unit ? `${spec.label} (${spec.unit})` : spec.label
        const current = row[field]
        const defaultLabel = `${formatValue(defaults[field])} (default)`
        if (spec.kind === 'number') {
          return (
            <Field key={field} label={label} htmlFor={id}>
              <NumberSave id={id} value={(current as number | null) ?? null} placeholder={defaultLabel} step={spec.step}
                onSave={(v) => onSave({ [field]: v })} />
            </Field>
          )
        }
        // Choices and yes/no keep a "Default" option, which clears the column.
        const value = current === null || current === undefined || current === ''
          ? DEFAULT_CHOICE
          : String(current === true ? 1 : current === false ? 0 : current)
        return (
          <Field key={field} label={label} htmlFor={id}>
            <Select value={value} onValueChange={(v) => onSave({ [field]: parseChoice(spec.kind, v) })}>
              <SelectTrigger id={id} aria-label={label} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_CHOICE}>{defaultLabel}</SelectItem>
                {spec.kind === 'bool'
                  ? [<SelectItem key="1" value="1">yes</SelectItem>, <SelectItem key="0" value="0">no</SelectItem>]
                  : spec.options.map((o) => <SelectItem key={o} value={String(o)}>{String(o)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )
      })}

      <Button variant="destructive" size="sm" onClick={onDelete}>Delete component</Button>
    </div>
  )
}

/** Select value -> column value: the default sentinel clears; bool -> true/false; numeric options -> number. */
function parseChoice(kind: 'choice' | 'bool', v: string): unknown {
  if (v === DEFAULT_CHOICE || v === '') return null
  if (kind === 'bool') return v === '1'
  return /^\d+$/.test(v) ? Number(v) : v
}

function FlowsEditor({
  boardId,
  components,
  flows,
  ready,
  onAdd,
  onRemove,
}: {
  boardId: string
  components: { recordId: string; data: ComponentRow }[]
  flows: { recordId: string; data: FlowRow }[]
  ready: boolean
  onAdd: (row: FlowRow) => void
  onRemove: (id: string) => void
}) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [label, setLabel] = useState('')
  const name = (id: string) => components.find((c) => c.recordId === id)?.data.label || '(deleted)'
  const options = components.map((c) => (
    <SelectItem key={c.recordId} value={c.recordId}>{c.data.label || '(unnamed)'}</SelectItem>
  ))

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Flows ({flows.length})</h2>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready || !fromId || !toId || fromId === toId) return
          onAdd({ boardId, fromId, toId, label: label.trim() })
          setLabel('')
        }}
      >
        <Select value={fromId} onValueChange={setFromId}>
          <SelectTrigger aria-label="From" className="w-full"><SelectValue placeholder="From…" /></SelectTrigger>
          <SelectContent>{options}</SelectContent>
        </Select>
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger aria-label="To" className="w-full"><SelectValue placeholder="To…" /></SelectTrigger>
          <SelectContent>{options}</SelectContent>
        </Select>
        <Input aria-label="Flow label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={80} />
        <Button type="submit" variant="secondary" disabled={!ready || !fromId || !toId || fromId === toId}>Add flow</Button>
      </form>
      {fromId && fromId === toId && <p className="mt-1 text-xs text-destructive">A flow needs two different components.</p>}
      {flows.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {flows.map((f) => (
            <li key={f.recordId} className="flex items-center justify-between rounded border border-border px-3 py-2">
              <span>
                {name(f.data.fromId)} → {name(f.data.toId)}
                {f.data.label ? <span className="text-muted-foreground"> ({f.data.label})</span> : null}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onRemove(f.recordId)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/**
 * A text input that shows the shared value, lets you type locally, and saves
 * on blur or Enter. While you're typing, remote changes don't overwrite you;
 * once you leave the field it follows the shared value again.
 */
function SaveOnBlur({
  value, onSave, ...props
}: { value: string; onSave: (v: string) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  const commit = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }
  return (
    <Input
      {...props}
      value={draft}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
    />
  )
}

/** Same as SaveOnBlur for numbers. Empty clears the column (the default applies). */
function NumberSave({
  value, onSave, ...props
}: { value: number | null; onSave: (v: number | null) => void } & Omit<ComponentProps<'input'>, 'value' | 'onChange'>) {
  const shown = value === null ? '' : String(value)
  return (
    <SaveOnBlur
      {...props}
      type="number"
      min={0}
      value={shown}
      onSave={(v) => {
        if (v.trim() === '') return onSave(null)
        const n = Number(v)
        if (Number.isFinite(n) && n >= 0) onSave(n)
      }}
    />
  )
}
