/**
 * POST /api/actions/reviewBoard  { boardId }
 *
 * Runs the AI reviewer on one board and saves the result as a `reviews`
 * record that everyone on the board sees live.
 *
 * Docs: https://docs.deep.space/guides/server-actions (actions run as the
 * app, bypassing RBAC; the caller's JWT is verified first and passed in as
 * callerJwt), https://docs.deep.space/sdk-reference/worker/ai
 * (createDeepSpaceAI; passing authToken bills the caller).
 *
 * The model reads the board only through tools (get_board, get_costs) and
 * can only finish by calling submit_review with a schema-checked review. It
 * gets no tool that writes records, so text on the board can't make it
 * change anything; the only write is the review record this action creates.
 */
import { generateText, hasToolCall, stepCountIs, tool } from 'ai'
import { z } from 'zod/v4'
import { createDeepSpaceAI, resolveAppMembership, resolveDeepSpaceAgentModel } from 'deepspace/worker'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { boardFromRecords, type BoardRow, type ComponentRow, type FlowRow } from '../board/fromRecords'
import { boardFingerprint } from '../board/fingerprint'
import { compute } from '../cost/costModel'
import { boardToPrices } from '../cost/quantify'
import {
  REVIEW_MODEL, REVIEW_PROMPT, REVIEW_SYSTEM, boardForModel, cleanReview, costsForModel, reviewSchema, totalsAtReview,
  type Review,
} from '../ai/review/reviewData'

/** Enough for get_board, get_costs and submit_review, with room for one retry. */
const MAX_STEPS = 6
/** A review is a few hundred words of JSON; this bounds the credits reserved per call. */
const MAX_OUTPUT_TOKENS = 6000
const MAX_COMPONENTS = 200

export const reviewBoard: ActionHandler<Env> = async ({ userId, params, tools, env, callerJwt }) => {
  const boardId = params.boardId
  if (typeof boardId !== 'string' || !boardId || boardId.length > 100) {
    return { success: false, error: 'boardId is required' }
  }

  // Actions bypass RBAC, so check membership here, as the starter's chat does.
  const membership = await resolveAppMembership(env, userId)
  if (!membership) return { success: false, error: 'Could not check membership, try again' }
  if (!membership.member) return { success: false, error: 'Forbidden' }

  // Read the board exactly as the page does: same records, same order.
  const boardRes = await tools.get<BoardRow>('boards', boardId)
  if (!boardRes.success) return { success: false, error: 'Board not found' }
  const comps = await tools.query<ComponentRow>('components', { where: { boardId }, orderBy: 'createdAt', orderDir: 'asc', limit: MAX_COMPONENTS })
  const flows = await tools.query<FlowRow>('flows', { where: { boardId }, orderBy: 'createdAt', orderDir: 'asc', limit: MAX_COMPONENTS * 2 })
  if (!comps.success || !flows.success) return { success: false, error: 'Could not read the board' }

  const shaped = boardFromRecords(boardRes.data.record, comps.data.records, flows.data.records)
  const { prices, workload } = boardToPrices(shaped)
  const costs = compute(prices, workload)

  // Fail fast with a clear message if the SDK's catalog drops the model.
  if (!resolveDeepSpaceAgentModel(REVIEW_MODEL, 'application')) {
    return { success: false, error: `Model ${REVIEW_MODEL} is not available` }
  }

  let submitted: Review | null = null
  const reviewTools = {
    get_board: tool({
      description: 'Read the design board: components with their type, label and sizing (stated or default), and the flows between them.',
      inputSchema: z.object({}),
      execute: async () => boardForModel(shaped, workload),
    }),
    get_costs: tool({
      description: 'Read the monthly cost of every component on AWS, Google Cloud and Azure, with the price lines behind each number.',
      inputSchema: z.object({}),
      execute: async () => costsForModel(costs),
    }),
    submit_review: tool({
      description: 'Submit the finished review. Call exactly once, after reading the board and the costs.',
      inputSchema: reviewSchema,
      execute: async (review) => {
        submitted = review
        return { ok: true }
      },
    }),
  }

  try {
    await generateText({
      // Passing the caller's token bills the person who clicked "Review board".
      model: createDeepSpaceAI(env, 'anthropic', { authToken: callerJwt })(REVIEW_MODEL),
      system: REVIEW_SYSTEM,
      prompt: REVIEW_PROMPT,
      tools: reviewTools,
      // No toolChoice: 'required'. This model rejects forced tool choice
      // ("tool_choice ... any is not supported"). The prompt asks for
      // submit_review, and the check below fails clearly if it never comes.
      stopWhen: [hasToolCall('submit_review'), stepCountIs(MAX_STEPS)],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    })
  } catch (e) {
    console.error('[reviewBoard] model call failed', e)
    return { success: false, error: 'The AI reviewer could not finish. Try again.' }
  }

  if (!submitted) return { success: false, error: 'The AI reviewer did not submit a review. Try again.' }
  const { review, dropped } = cleanReview(submitted, shaped.components.map((c) => c.id).concat(workload.components.map((c) => c.id)))
  if (dropped) console.info(`[reviewBoard] dropped ${dropped} finding(s) for unknown components`)

  const saved = await tools.create('reviews', {
    boardId,
    requestedBy: userId,
    model: REVIEW_MODEL,
    summary: review.summary,
    findings: review.findings,
    totals: totalsAtReview(costs),
    fingerprint: boardFingerprint(shaped),
  })
  if (!saved.success) return { success: false, error: 'Could not save the review' }
  return { success: true, data: { reviewId: (saved.data as { recordId: string }).recordId, findings: review.findings.length } }
}
