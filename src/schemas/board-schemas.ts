/**
 * The shared design board: boards, their components, and flows between them.
 *
 * Docs: https://docs.deep.space/guides/data-storage (defining collections),
 * https://docs.deep.space/concepts/permissions (roles),
 * https://docs.deep.space/sdk-reference/worker/schemas (column types).
 *
 * Sizing is stored as one column per field rather than one JSON column:
 * concurrent `put`s merge field by field (docs: concepts/realtime-sync), so
 * two people editing different fields of the same component both keep their
 * change. A JSON column would be replaced whole, losing one of the edits.
 */
import type { CollectionSchema, RolePermissions } from 'deepspace/schema'
import { CACHE_SIZES, COMPONENT_TYPES } from '../cost/board'

/** Any signed-in member edits any board together; signed-out visitors see nothing. */
const teamEditable: Record<string, RolePermissions> = {
  member: { read: true, create: true, update: true, delete: true },
  admin: { read: true, create: true, update: true, delete: true },
}

const num = (name: string) => ({ name, storage: 'number' as const, interpretation: 'plain' })
const text = (name: string) => ({ name, storage: 'text' as const, interpretation: 'plain' })

export const boardsSchema: CollectionSchema = {
  name: 'boards',
  columns: [
    { ...text('name'), required: true, maxLength: 120 },
    num('egress_gb'),
  ],
  permissions: teamEditable,
}

export const componentsSchema: CollectionSchema = {
  name: 'components',
  columns: [
    { ...text('boardId'), required: true },
    { name: 'type', storage: 'text', interpretation: { kind: 'select', options: [...COMPONENT_TYPES] }, required: true },
    { ...text('label'), maxLength: 80 },
    // Position on the board, for the visual layout later.
    num('x'),
    num('y'),
    // Sizing, one column per field (see board.ts for which type uses which).
    num('count'),
    num('vcpu'),
    num('hours'),
    { name: 'ha', storage: 'number', interpretation: { kind: 'boolean' } },
    num('storage_gb'),
    { name: 'size', storage: 'text', interpretation: { kind: 'select', options: [...CACHE_SIZES] } },
    num('messages_millions'),
    num('message_kb'),
    num('gb_processed'),
    num('gb_delivered'),
    num('requests_millions'),
  ],
  permissions: teamEditable,
}

export const flowsSchema: CollectionSchema = {
  name: 'flows',
  columns: [
    { ...text('boardId'), required: true },
    { ...text('fromId'), required: true },
    { ...text('toId'), required: true },
    { ...text('label'), maxLength: 80 },
  ],
  permissions: teamEditable,
}
