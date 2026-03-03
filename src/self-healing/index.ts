// Playwright wrapper (Phase 1)
export { PlaywrightWrapper } from './playwright/wrapper';

// OpenAI integration (Phase 2)
export { LlmClient } from './openai/llm-client';
export { cleanDom } from './openai/dom-cleaner';
export { buildHealingPrompt } from './openai/prompt-builder';

// Config
export { loadConfig } from './config';
export type { SelfHealingConfig } from './config';

// Logger
export { logger } from './logger';

// Types
export type {
  LocatorDescriptor,
  HealingContext,
  HealingResult,
  WrapperOptions,
  HealCallback,
} from './types';
