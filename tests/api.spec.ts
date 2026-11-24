import { test, expect } from '@playwright/test'
import { test as signedInTest, loadAllTestAccounts } from 'deepspace/testing'

test.describe('API tests', () => {
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  test('WebSocket endpoint exists', async ({ page }) => {
    // /home is a dynamic page (under src/pages/(app)/), so mounting it boots
    // the providers and auto-connects the records WebSocket. The static
    // landing at '/' deliberately does neither — see smoke.spec.ts.
    await page.goto('/home')
    // Wait for the app to connect its WebSocket (it auto-connects on mount)
    await page.waitForSelector('[data-testid="app-navigation"]', { timeout: 15000 })
    // If the app loaded and connected, the WS endpoint works
  })
})

/**
 * Integration proxy spend control (NOTES.md, step 12).
 *
 * The starter billed the app owner for any integration not listed in
 * src/integrations.ts, for any signed-in user. Unlisted integrations are now
 * refused before any token is attached. Docs:
 * https://docs.deep.space/guides/external-apis ("Billing - developer vs user").
 *
 * The requests send an empty body, so even when the route was still open the
 * platform would refuse it on validation rather than run a paid call.
 */
test.describe('Integration proxy', () => {
  test('signed out: an unlisted integration is refused (404)', async ({ request }) => {
    const res = await request.post('/api/integrations/exa/search', { data: {} })
    expect(res.status()).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'Integration not enabled for this app' })
  })

  test('signed out: a listed integration still requires sign-in (401)', async ({ request }) => {
    const res = await request.post('/api/integrations/google/anything', { data: {} })
    expect(res.status()).toBe(401)
  })
})

signedInTest.describe('Integration proxy, signed in', () => {
  signedInTest.skip(loadAllTestAccounts().length < 1, 'Needs 1 usable test account.')

  signedInTest('a signed-in member cannot reach an unlisted, owner-billed integration (404)', async ({ users }) => {
    const [a] = await users(1)
    // Same as the app's own integration client: trade the session cookie for a
    // bearer token (POST /api/auth/token, as the SDK's getAuthToken does).
    const tokenRes = await a.page.request.post('/api/auth/token', { data: {} })
    expect(tokenRes.ok()).toBe(true)
    const { token } = (await tokenRes.json()) as { token: string }
    expect(token).toBeTruthy()
    const res = await a.page.request.post('/api/integrations/exa/search', {
      data: {},
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status()).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'Integration not enabled for this app' })
  })
})
