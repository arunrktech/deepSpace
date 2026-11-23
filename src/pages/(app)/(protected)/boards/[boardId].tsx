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
 */
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutations, useQuery } from 'deepspace'
import { Button, Input, Label, useToast } from '@/components/ui'
import { COMPONENT_TYPES, DEFAULT_SIZING, LABEL, type ComponentType } from '../../../../cost/board'
import type { BoardRow, ComponentRow, FlowRow } from '../../../../board/fromRecords'
import { fieldsFor, specFor } from '../../../../board/fields'

const selectClass =
  'h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'

export default function BoardPage() {
  const { boardId = '' } = useParams()
  const boards = useQuery<BoardRow>('boards')
  const components = useQuery<ComponentRow>('components', { where: { boardId }, orderBy: 'createdAt' })
  const flows = useQuery<FlowRow>('flows', { where: { boardId }, orderBy: 'createdAt' })
  const boardMut = useMutations<BoardRow>('boards')
  const compMut = useMutations<ComponentRow>('components')
  const flowMut = useMutations<FlowRow>('flows')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const board = boards.records.find((b) => b.recordId === boardId)
  const selected = components.records.find((c) => c.recordId === selectedId)

  if (boards.status === 'loading') return <p className="p-6 text-sm text-muted-foreground">Loading board…</p>
  if (!board) {
    return (
      <div className="p-6 text-sm">
        Board not found. <Link to="/boards" className="underline">Back to boards</Link>
      </div>
    )
  }

  function addComponent(type: ComponentType) {
    const n = components.records.filter((c) => c.data.type === type).length + 1
    const id = compMut.create({ boardId, type, label: `${LABEL[type]} ${n}`, x: 0, y: 0 })
    void id.then(setSelectedId)
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

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Add a component</h2>
        <div className="flex flex-wrap gap-2">
          {COMPONENT_TYPES.map((t) => (
            <Button key={t} variant="outline" size="sm" onClick={() => addComponent(t)}>
              + {LABEL[t]}
            </Button>
          ))}
        </div>
      </section>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_22rem]">
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            Components ({components.records.length})
          </h2>
          {components.records.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              Nothing here yet. Add a service, database or any other component above.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {components.records.map((c) => (
                <li key={c.recordId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.recordId)}
                    className={`w-full rounded-lg border p-3 text-left hover:bg-accent ${
                      c.recordId === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border'
                    }`}
                  >
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {LABEL[c.data.type as ComponentType] ?? c.data.type}
                    </div>
                    <div className="font-medium">{c.data.label || '(unnamed)'}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{sizingSummary(c.data)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <FlowsEditor
            boardId={boardId}
            components={components.records}
            flows={flows.records}
            onAdd={(row) => flowMut.create(row)}
            onRemove={(id) => flowMut.remove(id)}
          />
        </section>

        <aside className="rounded-lg border border-border p-4">
          {selected ? (
            <ComponentEditor
              key={selected.recordId}
              row={selected.data}
              onSave={(patch) => compMut.put(selected.recordId, patch)}
              onDelete={() => deleteComponent(selected.recordId)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Select a component to edit its name and sizing.</p>
          )}
        </aside>
      </div>
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
        const placeholder = `${formatValue(defaults[field])} (default)`
        return (
          <Field key={field} label={label} htmlFor={id}>
            {spec.kind === 'number' ? (
              <NumberSave id={id} value={(current as number | null) ?? null} placeholder={placeholder} step={spec.step}
                onSave={(v) => onSave({ [field]: v })} />
            ) : (
              // Choices and yes/no keep a "Default" option, which clears the column.
              <select
                id={id}
                className={selectClass}
                value={current === null || current === undefined ? '' : String(current === true ? 1 : current === false ? 0 : current)}
                onChange={(e) => onSave({ [field]: parseChoice(spec.kind, e.target.value) })}
              >
                <option value="">{placeholder}</option>
                {spec.kind === 'bool' ? (
                  <>
                    <option value="1">yes</option>
                    <option value="0">no</option>
                  </>
                ) : (
                  spec.options.map((o) => <option key={o} value={String(o)}>{String(o)}</option>)
                )}
              </select>
            )}
          </Field>
        )
      })}

      <Button variant="destructive" size="sm" onClick={onDelete}>Delete component</Button>
    </div>
  )
}

/** Select value -> column value: '' clears; bool -> true/false; numeric options -> number. */
function parseChoice(kind: 'choice' | 'bool', v: string): unknown {
  if (v === '') return null
  if (kind === 'bool') return v === '1'
  return /^\d+$/.test(v) ? Number(v) : v
}

function FlowsEditor({
  boardId,
  components,
  flows,
  onAdd,
  onRemove,
}: {
  boardId: string
  components: { recordId: string; data: ComponentRow }[]
  flows: { recordId: string; data: FlowRow }[]
  onAdd: (row: FlowRow) => void
  onRemove: (id: string) => void
}) {
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [label, setLabel] = useState('')
  const name = (id: string) => components.find((c) => c.recordId === id)?.data.label || '(deleted)'

  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Flows ({flows.length})</h2>
      <form
        className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault()
          if (!fromId || !toId || fromId === toId) return
          onAdd({ boardId, fromId, toId, label: label.trim() })
          setLabel('')
        }}
      >
        <select aria-label="From" className={selectClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
          <option value="">From…</option>
          {components.map((c) => <option key={c.recordId} value={c.recordId}>{c.data.label}</option>)}
        </select>
        <select aria-label="To" className={selectClass} value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">To…</option>
          {components.map((c) => <option key={c.recordId} value={c.recordId}>{c.data.label}</option>)}
        </select>
        <Input aria-label="Flow label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" maxLength={80} />
        <Button type="submit" variant="secondary" disabled={!fromId || !toId || fromId === toId}>Add flow</Button>
      </form>
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
