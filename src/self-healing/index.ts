// ── Phase 1: Playwright Wrapper ──────────────────────────────────────────────
export { PlaywrightWrapper } from './playwright/wrapper';

// ── Phase 2: OpenAI Integration ──────────────────────────────────────────────
export { LlmClient }         from './openai/llm-client';
export { cleanDom }          from './openai/dom-cleaner';
export { buildHealingPrompt, buildCandidatePrompt } from './openai/prompt-builder';
export { extractCandidates, formatCandidatesForPrompt } from './openai/dom-context-extractor';
export type { CandidateElement, ExtractionOptions } from './openai/dom-context-extractor';
export { rankCandidates }    from './openai/candidate-ranker';
export type { RankedCandidate, RankingContext } from './openai/candidate-ranker';

// ── Phase 3: Healing Core ─────────────────────────────────────────────────────
export { LocatorValidator }   from './core/locator-validator';
export { ResultsStore }       from './core/results-store';
export { HealingOrchestrator, createHealingWrapper } from './core/healing-orchestrator';

// ── Phase 4: File Patcher ─────────────────────────────────────────────────────
export { FilePatcher } from './core/file-patcher';
export type { PatchResult } from './core/file-patcher';

// ── Phase 5: Metrics Collector ────────────────────────────────────────────────
export { MetricsCollector } from './core/metrics-collector';
export type { HealingMetrics, HealingMetricDetail } from './core/metrics-collector';

// ── Phase 4: Git Service & GitHub PR ─────────────────────────────────────────
export { GitService } from './git/git-service';
export type { GitResult } from './git/git-service';
export { GitHubPRCreator } from './git/github-pr-creator';
export type { PRResult } from './git/github-pr-creator';

// ── Config ────────────────────────────────────────────────────────────────────
export { loadConfig, loadGitConfig, loadGitHubConfig } from './config';
export type { SelfHealingConfig, GitConfig, GitHubConfig } from './config';

// ── Logger ────────────────────────────────────────────────────────────────────
export { logger }             from './logger';

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  ActionType,
  LocatorDescriptor,
  HealingContext,
  HealingResult,
  WrapperOptions,
  HealCallback,
} from './types';

export type { ValidationResult } from './core/locator-validator';
export type { HealingSummary, HealingReport } from './core/results-store';
