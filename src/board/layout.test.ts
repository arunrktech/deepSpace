import { describe, expect, it } from 'vitest'
import { BOX, arrowBetween, layoutBoard, movesForDrag, snap } from './layout'

describe('layoutBoard', () => {
  it('places new components in columns by layer, stacking down', () => {
    const pos = layoutBoard([
      { id: 'lb', type: 'lb' },
      { id: 'web', type: 'service' },
      { id: 'q', type: 'queue' },
      { id: 'db', type: 'database', x: 0, y: 0 },
    ])
    expect(pos.get('lb')).toEqual({ x: 40, y: 40 })
    expect(pos.get('web')).toEqual({ x: 340, y: 40 })
    expect(pos.get('q')).toEqual({ x: 340, y: 40 + BOX.height + 32 })
    expect(pos.get('db')).toEqual({ x: 640, y: 40 })
  })

  it('keeps dragged positions and stacks new boxes below them', () => {
    const pos = layoutBoard([
      { id: 'web', type: 'service', x: 350, y: 300 },
      { id: 'api', type: 'service' },
      { id: 'far', type: 'database', x: 1200, y: 10 },
    ])
    expect(pos.get('web')).toEqual({ x: 350, y: 300 })
    expect(pos.get('api')).toEqual({ x: 340, y: 300 + BOX.height + 32 })
    expect(pos.get('far')).toEqual({ x: 1200, y: 10 })
  })

  it('gives the same answer for the same records (every viewer agrees)', () => {
    const input = [{ id: 'a', type: 'cache' as const }, { id: 'b', type: 'storage' as const }]
    expect([...layoutBoard(input)]).toEqual([...layoutBoard(structuredClone(input))])
  })
})

describe('arrowBetween', () => {
  it('starts and ends on the box edges for side-by-side boxes', () => {
    const a = arrowBetween({ x: 0, y: 0 }, { x: 300, y: 0 })
    expect(a).toEqual({ x1: BOX.width, y1: BOX.height / 2, x2: 300, y2: BOX.height / 2 })
  })

  it('handles stacked boxes and identical positions', () => {
    const v = arrowBetween({ x: 0, y: 0 }, { x: 0, y: 200 })
    expect(v).toEqual({ x1: BOX.width / 2, y1: BOX.height, x2: BOX.width / 2, y2: 200 })
    const same = arrowBetween({ x: 5, y: 5 }, { x: 5, y: 5 })
    expect(same.x1).toBe(same.x2)
  })
})

describe('snap', () => {
  it('rounds to 10 px and never goes negative', () => {
    expect(snap(123.4)).toBe(120)
    expect(snap(125)).toBe(130)
    expect(snap(-40)).toBe(0)
  })
})

describe('movesForDrag', () => {
  it('saves the dragged box and pins every auto-placed box where it is', () => {
    const input = [
      { id: 'db', type: 'database' as const },
      { id: 'files', type: 'storage' as const },
      { id: 'web', type: 'service' as const, x: 110, y: 210 },
    ]
    const layout = layoutBoard(input)
    expect(movesForDrag(input, layout, { id: 'db', x: 640, y: 250 })).toEqual([
      { id: 'db', x: 640, y: 250 },
      { id: 'files', x: 640, y: 40 + BOX.height + 32 },
    ])
  })

  it('after pinning, the other boxes keep their place', () => {
    const before = layoutBoard([{ id: 'db', type: 'database' }, { id: 'files', type: 'storage' }])
    const moves = movesForDrag([{ id: 'db', type: 'database' }, { id: 'files', type: 'storage' }], before, { id: 'db', x: 640, y: 400 })
    const after = layoutBoard(moves.map((m) => ({ ...m, type: m.id === 'db' ? ('database' as const) : ('storage' as const) })))
    expect(after.get('files')).toEqual(before.get('files'))
  })
})
