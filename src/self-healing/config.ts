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

// ── Git & GitHub Configuration ────────────────────────────────────────────────

export interface GitConfig {
  /** Prefix nama branch yang dibuat otomatis (default: 'auto-healing') */
  branchPrefix: string;
  /** Prefix pesan commit (default: 'chore(self-healing)') */
  commitMsgPrefix: string;
}

export interface GitHubConfig {
  /** GitHub token untuk autentikasi API — GITHUB_TOKEN (wajib) */
  token: string;
  /** Repo dalam format owner/repo — GITHUB_REPO (wajib, cth: wildanniam/self-healing-automation) */
  repo: string;
}

/**
 * Memuat konfigurasi git dari environment variables.
 * Semua nilai opsional — ada default yang masuk akal.
 */
export function loadGitConfig(): GitConfig {
  return {
    branchPrefix:    getOptionalEnv('GIT_BRANCH_PREFIX',     'auto-healing'),
    commitMsgPrefix: getOptionalEnv('GIT_COMMIT_MSG_PREFIX', 'chore(self-healing)'),
  };
}

/**
 * Memuat konfigurasi GitHub dari environment variables.
 * Melempar Error jika GITHUB_TOKEN atau GITHUB_REPO tidak ada.
 */
export function loadGitHubConfig(): GitHubConfig {
  return {
    token: getRequiredEnv('GITHUB_TOKEN'),
    repo:  getRequiredEnv('GITHUB_REPO'),
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
