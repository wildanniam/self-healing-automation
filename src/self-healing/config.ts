// ── GitHub & Git config (dipakai oleh Phase 4) ────────────────────────────────

export interface GitHubConfig {
  /** Personal Access Token GitHub (Contents + Pull requests: read/write) */
  token: string;
  /** Username atau org name pemilik repo (misal: wildanniam) */
  owner: string;
  /** Nama repository (misal: self-healing) */
  repo: string;
  /** Branch tujuan PR (default: main) */
  baseBranch: string;
}

export interface GitBotConfig {
  /** Nama yang tampil di commit message (default: Self-Healing Bot) */
  name: string;
  /** Email yang tampil di commit message */
  email: string;
}

// ── Core config (dipakai oleh Phase 1-3) ─────────────────────────────────────

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

/**
 * Memuat konfigurasi GitHub untuk Phase 4 (auto-patching & PR).
 * Melempar Error jika GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO tidak tersedia.
 */
export function loadGitHubConfig(): GitHubConfig {
  return {
    token:      getRequiredEnv('GITHUB_TOKEN'),
    owner:      getRequiredEnv('GITHUB_OWNER'),
    repo:       getRequiredEnv('GITHUB_REPO'),
    baseBranch: getOptionalEnv('GITHUB_BASE_BRANCH', 'main'),
  };
}

/**
 * Memuat konfigurasi Git bot untuk commit message di Phase 4.
 * Semua nilai opsional — sudah ada fallback default.
 */
export function loadGitBotConfig(): GitBotConfig {
  return {
    name:  getOptionalEnv('GIT_BOT_NAME',  'Self-Healing Bot'),
    email: getOptionalEnv('GIT_BOT_EMAIL', 'self-healing-bot@noreply.com'),
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
