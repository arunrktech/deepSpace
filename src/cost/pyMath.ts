/**
 * Python's round() and sum() for floats, so the TypeScript port produces the
 * same cents as scripts/cost_model.py.
 */

/**
 * Python's round(x, digits).
 *
 * Python rounds the *exact* binary value of x and breaks exact ties to the even
 * digit ("banker's rounding"): round(0.125, 2) == 0.12, round(0.375, 2) == 0.38.
 * Math.round(x * 100) / 100 differs twice over: it rounds ties up, and x * 100
 * is itself inexact (1.005 * 100 = 100.49999999999999).
 *
 * Number.prototype.toFixed already rounds the exact binary value; it only
 * differs from Python on an exact tie, where it rounds away from zero. So:
 * look at the exact decimal expansion, and if the digits after `digits` are
 * exactly "5000...", round to even ourselves.
 */
export function pyRound(x: number, digits = 0): number {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21) return x // toFixed switches to exponent form

  const negative = x < 0
  // toFixed(100) is the exact decimal expansion for the magnitudes we handle:
  // money and percentages need far fewer than 100 fractional digits.
  const exact = Math.abs(x).toFixed(100)
  const [whole, frac] = exact.split('.')
  const rest = frac.slice(digits)

  let result: number
  if (/^50*$/.test(rest)) {
    // Exact tie: keep the truncated value if its last digit is even, else round up.
    const truncated = digits > 0 ? `${whole}.${frac.slice(0, digits)}` : whole
    const lastDigit = Number(truncated[truncated.length - 1])
    result = lastDigit % 2 === 0 ? Number(truncated) : Number(Math.abs(x).toFixed(digits))
  } else {
    result = Number(Math.abs(x).toFixed(digits))
  }
  return negative ? -result : result
}

/**
 * Python 3.12+ sum() of floats.
 *
 * Python 3.12 made sum() use compensated (Neumaier) summation for floats, which
 * keeps the low-order bits a plain left-to-right loop throws away. A one-bit
 * difference can move a value across a rounding boundary, so we match it.
 */
export function pySum(values: Iterable<number>): number {
  let total = 0
  let compensation = 0
  for (const x of values) {
    const t = total + x
    // Add back whatever the smaller operand lost in the addition above.
    if (Math.abs(total) >= Math.abs(x)) compensation += total - t + x
    else compensation += x - t + total
    total = t
  }
  return total + compensation
}
