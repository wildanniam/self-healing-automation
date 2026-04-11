# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                    # Run all Playwright tests (headless)
npm run test:headed         # Run with visible browser
npm run test:debug          # Debug mode with Playwright inspector
npm run type-check          # TypeScript validation (tsc --noEmit)

# Run a single test file
npx playwright test tests/self-healing-demo.spec.ts

# Run a single test by name
npx playwright test --grep "Broken Locator"

# Run with a specific browser
npx playwright test --project=chromium
```

**Setup:** Copy `.env.example` to `.env` and set `OPENAI_API_KEY` before running tests that exercise the LLM healing path.

## Architecture

This is a **self-healing test automation system** that intercepts Playwright locator failures, uses an LLM to suggest alternative selectors, validates them at runtime, and falls back to the healed locator — all within the test run.

The latest development context is documented in `docs/targeted-dom-context-extraction.md`. Read that file before changing Phase 2 / LLM context logic.

Current priority: improve Phase 2 so the system does not send a full cleaned DOM that is simply truncated. For complex React/Ant Design pages such as OmniX, the next implementation should extract relevant candidate elements first, rank them, and send those candidates to the LLM with the failure context.

The system is implemented in runtime healing + post-heal permanency phases:

### Phase 1 — Playwright Wrapper (`src/self-healing/playwright/wrapper.ts`)
Wraps Playwright actions (`safeClick`, `safeFill`, `safeSelectOption`, `safeGetText`, `safeWaitForVisible`, `safeIsVisible`). On failure, it captures a DOM snapshot and invokes the `HealCallback` if configured.

### Phase 2 — LLM Analysis (`src/self-healing/openai/`)
- `dom-cleaner.ts` — strips noise (`<script>`, `<style>`, `<svg>`, etc.) and truncates DOM to `HEALING_DOM_MAX_CHARS` (default 8000) for token efficiency
- `prompt-builder.ts` — constructs the LLM prompt enforcing selector priority (`id → data-testid → name → aria-label → class → XPath`) and JSON-only output format `{"new_locator": "..."}`
- `llm-client.ts` — calls OpenAI API, parses JSON response with regex fallback

### Phase 3 — Validation & Orchestration (`src/self-healing/core/`)
- `healing-orchestrator.ts` — retry loop (up to `HEALING_MAX_RETRIES`, default 3): requests LLM candidate → validates at runtime → accepts or retries
- `locator-validator.ts` — validates candidate selector against live browser DOM; requires at least 1 matching element
- `results-store.ts` — accumulates `HealingResult` objects in memory; persists report to `./healing-results/results.json` and DOM snapshots to `./healing-results/snapshots/`

### Phase 4 — Auto-Patching & GitHub PR
File patcher rewrites `.spec.ts` files with healed locators. `post-heal` can create a branch, commit, push, and open a GitHub Pull Request.

### Phase 5 — Current Phase 2 Upgrade
Do not implement full DOM diff first. Build targeted candidate extraction first, then validate whether the correct target element appears in the candidate list. See `docs/targeted-dom-context-extraction.md`.

### Public API
`src/self-healing/index.ts` exports `createHealingWrapper()` — a factory that wires up all three phases. Tests import this to get a `wrapper` object with all `safe*` methods ready.

### Data Flow
```
Test calls wrapper.safeClick(locator)
  → Playwright tries the selector
  → On failure: capture DOM → clean DOM → build prompt → call LLM
  → Get candidate selector → validate in browser
  → If valid: retry action with new selector, record 'healed'
  → If invalid: retry LLM up to maxRetries, then record 'failed'
```

### Key Types (`src/self-healing/types/index.ts`)
- `LocatorDescriptor` — selector + test/step metadata
- `HealingContext` — failure context passed to the heal callback
- `HealingResult` — outcome with status (`healed | failed | skipped`), old/new locator, timestamp
- `HealCallback` — async `(context: HealingContext) => string | null`

### Configuration (`src/self-healing/config.ts`)
All config comes from environment variables. `OPENAI_API_KEY` is required; all others have defaults. Config is loaded once at startup and validated (throws if key is missing).

### Tests
- `tests/fixtures/demo.html` — minimal login form; IDs document which selectors are "current" (`#user-email`) vs. "broken" (`#username`) to simulate DOM drift
- `tests/self-healing-demo.spec.ts` — three E2E scenarios: happy path (no healing), single broken locator, multiple broken locators
- `tests/example.spec.ts` — standard Playwright smoke tests unrelated to self-healing

### Output Artifacts
- `playwright-report/` — HTML test report
- `healing-results/results.json` — healing summary with success rate
- `healing-results/snapshots/` — HTML DOM snapshots captured at failure time
