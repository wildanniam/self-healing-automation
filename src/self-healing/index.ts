// ── Phase 1: Playwright Wrapper ──────────────────────────────────────────────
export { PlaywrightWrapper } from './playwright/wrapper';

// ── Phase 2: OpenAI Integration ──────────────────────────────────────────────
export { LlmClient }         from './openai/llm-client';
export { cleanDom }          from './openai/dom-cleaner';
export { buildHealingPrompt } from './openai/prompt-builder';

// ── Phase 3: Healing Core ─────────────────────────────────────────────────────
export { LocatorValidator }   from './core/locator-validator';
export { ResultsStore }       from './core/results-store';
export { HealingOrchestrator, createHealingWrapper } from './core/healing-orchestrator';

// ── Phase 4: File Patcher ─────────────────────────────────────────────────────
export { FilePatcher } from './core/file-patcher';
export type { PatchResult } from './core/file-patcher';

// ── Phase 4: Git Service & GitLab MR ─────────────────────────────────────────
export { GitService } from './git/git-service';
export type { GitResult } from './git/git-service';
export { GitLabMRCreator } from './git/gitlab-mr-creator';
export type { MRResult } from './git/gitlab-mr-creator';

// ── Config ────────────────────────────────────────────────────────────────────
export { loadConfig, loadGitConfig, loadGitLabConfig } from './config';
export type { SelfHealingConfig, GitConfig, GitLabConfig } from './config';

// ── Logger ────────────────────────────────────────────────────────────────────
export { logger }             from './logger';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  LocatorDescriptor,
  HealingContext,
  HealingResult,
  WrapperOptions,
  HealCallback,
} from './types';

export type { ValidationResult } from './core/locator-validator';
export type { HealingSummary, HealingReport } from './core/results-store';
