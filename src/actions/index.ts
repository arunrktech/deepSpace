import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { reviewBoard } from './reviewBoard'

export const actions: Record<string, ActionHandler<Env>> = {
  reviewBoard,
}
