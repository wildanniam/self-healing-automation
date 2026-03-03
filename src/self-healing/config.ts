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
