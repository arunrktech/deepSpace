#!/usr/bin/env node
/**
 * Fails if the dev-only test probe (src/dev/TestProbe.tsx, used only by
 * tests/board.spec.ts T14) is in the production build.
 *
 * Run after `npm run build` (vite build writes dist/):
 *   npm run build && node scripts/check-no-test-probe.mjs
 *
 * Scans every file under dist/ for the probe's global name and its module
 * name. Exit 0 = clean, 1 = found (prints where), 2 = no dist/ to scan.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const NEEDLES = ['__archreviewTestProbe', 'TestProbe']

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

let scanned = 0
const hits = []
try {
  for (const file of files(DIST)) {
    scanned++
    const text = readFileSync(file, 'latin1')
    for (const needle of NEEDLES) if (text.includes(needle)) hits.push(`${relative(DIST, file)}: ${needle}`)
  }
} catch (e) {
  console.error(`No build to scan at ${DIST} (${e.code ?? e}). Run \`npm run build\` first.`)
  process.exit(2)
}

if (hits.length) {
  console.error(`Test probe found in the production build:\n  ${hits.join('\n  ')}`)
  process.exit(1)
}
console.log(`OK: no test probe in ${scanned} built file(s) under dist/.`)
