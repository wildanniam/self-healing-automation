export interface SelfHealingConfig {
  openai: {
    apiKey: string;
    model: 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
    maxTokens: number;
    temperature: number;
  };
  healing: {
    maxRetries: number;
    domMaxChars: number;
  };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[self-healing] Environment variable "${key}" wajib diisi.\n` +
      `Salin file .env.example menjadi .env lalu isi nilai OPENAI_API_KEY.`,
    );
  }
  return value;
}

function getOptionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const ALLOWED_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] as const;
type AllowedModel = typeof ALLOWED_MODELS[number];

function resolveModel(raw: string): AllowedModel {
  if ((ALLOWED_MODELS as readonly string[]).includes(raw)) {
    return raw as AllowedModel;
  }
  return 'gpt-4o-mini';
}

// ── Git & GitLab Configuration ────────────────────────────────────────────────

export interface GitConfig {
  /** Prefix nama branch yang dibuat otomatis (default: 'auto-healing') */
  branchPrefix: string;
  /** Prefix pesan commit (default: 'chore(self-healing)') */
  commitMsgPrefix: string;
}

export interface GitLabConfig {
  /** Personal Access Token GitLab — GITLAB_PRIVATE_TOKEN (wajib) */
  privateToken: string;
  /** Numeric project ID di GitLab — GITLAB_PROJECT_ID (wajib) */
  projectId: string;
  /** Base URL GitLab instance (default: https://gitlab.com) */
  baseUrl: string;
}

/**
 * Memuat konfigurasi git dari environment variables.
 * Semua nilai opsional — ada default yang masuk akal.
 */
export function loadGitConfig(): GitConfig {
  return {
    branchPrefix:    getOptionalEnv('GITLAB_BRANCH_PREFIX',     'auto-healing'),
    commitMsgPrefix: getOptionalEnv('GITLAB_COMMIT_MSG_PREFIX', 'chore(self-healing)'),
  };
}

/**
 * Memuat konfigurasi GitLab dari environment variables.
 * Melempar Error jika GITLAB_PRIVATE_TOKEN atau GITLAB_PROJECT_ID tidak ada.
 */
export function loadGitLabConfig(): GitLabConfig {
  return {
    privateToken: getRequiredEnv('GITLAB_PRIVATE_TOKEN'),
    projectId:    getRequiredEnv('GITLAB_PROJECT_ID'),
    baseUrl:      getOptionalEnv('GITLAB_BASE_URL', 'https://gitlab.com'),
  };
}

/**
 * Memuat konfigurasi self-healing dari environment variables.
 * Melempar Error jika OPENAI_API_KEY tidak tersedia.
 */
export function loadConfig(): SelfHealingConfig {
  return {
    openai: {
      apiKey:      getRequiredEnv('OPENAI_API_KEY'),
      model:       resolveModel(getOptionalEnv('OPENAI_MODEL', 'gpt-4o-mini')),
      maxTokens:   parseInt(getOptionalEnv('OPENAI_MAX_TOKENS', '500'), 10),
      temperature: parseFloat(getOptionalEnv('OPENAI_TEMPERATURE', '0')),
    },
    healing: {
      maxRetries:  parseInt(getOptionalEnv('HEALING_MAX_RETRIES', '3'), 10),
      domMaxChars: parseInt(getOptionalEnv('HEALING_DOM_MAX_CHARS', '8000'), 10),
    },
  };
}
