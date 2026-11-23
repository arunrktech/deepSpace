import { describe, expect, it } from 'vitest'
import { pyRound, pySum } from './pyMath'

// Expected values are what CPython 3.14 prints for the same expressions.
describe('pyRound matches Python round()', () => {
  it.each([
    [0.125, 2, 0.12], // exact tie -> even digit (Math.round would give 0.13)
    [0.375, 2, 0.38], // exact tie -> even digit
    [-0.125, 2, -0.12], // symmetric for negatives
    [2.5, 0, 2],
    [3.5, 0, 4],
    [2.675, 2, 2.67], // stored as 2.67499999..., not a tie
    [1.005, 2, 1], // stored as 1.00499999..., not a tie
    [167.6744, 2, 167.67],
    [146.966, 4, 146.966],
    [0, 2, 0],
  ])('round(%d, %d) == %d', (x, digits, expected) => {
    expect(pyRound(x, digits)).toBe(expected)
  })
})

describe('pySum matches Python 3.12+ sum()', () => {
  it('keeps the bits a plain loop loses', () => {
    const xs = [0.1, 0.2, 0.3]
    expect(xs.reduce((a, b) => a + b, 0)).toBe(0.6000000000000001) // plain JS loop
    expect(pySum(xs)).toBe(0.6) // Python 3.12+: sum([0.1, 0.2, 0.3]) == 0.6
  })

  it('handles empty input and large cancellations', () => {
    expect(pySum([])).toBe(0)
    expect(pySum([1e16, 1, -1e16])).toBe(1) // Python 3.12+ gives 1.0
  })
})
