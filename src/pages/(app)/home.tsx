/* home pattern: product-preview-first — signed in: your boards; signed out: the live cost panel on a sample board */
/**
 * /home. Signed in, it is the primary surface: the boards list. Signed out,
 * it shows the same cost panel the board page uses, on the comparator's
 * example board, with an inline sign-in. Docs: design/product-polish
 * ("Signed-in home = the primary surface", "Signed-out home = the same
 * surface in preview form").
 */
import { useState } from 'react'
import { AuthOverlay, useAuthProfileReady } from 'deepspace'
import { Button } from '@/components/ui'
import { APP_DISPLAY_NAME } from '../../constants'
import { CostPanel } from '../../board/CostPanel'
import { exampleCost } from '../../board/example'
import BoardsPage from './(protected)/boards/index'

export default function HomePage() {
  const { isSignedIn } = useAuthProfileReady({ requireUser: true })
  const [signIn, setSignIn] = useState(false)

  if (isSignedIn) return <BoardsPage />

  return (
    <div className="mx-auto max-w-5xl px-6 py-12 text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">{APP_DISPLAY_NAME}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        A shared system design board that shows monthly cost on AWS, Google Cloud and Azure as your team edits, and
        an AI review of cost and reliability per component.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => setSignIn(true)}>Sign in to start a board</Button>
        <span className="text-xs text-muted-foreground">Below: a sample board, priced live by the same code.</span>
      </div>
      <div className="mt-8">
        <CostPanel result={exampleCost()} />
      </div>
      {signIn && <AuthOverlay onClose={() => setSignIn(false)} />}
    </div>
  )
}
