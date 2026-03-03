import OpenAI from 'openai';
import type { HealingContext } from '../types';
import type { SelfHealingConfig } from '../config';
import { logger } from '../logger';
import { cleanDom } from './dom-cleaner';
import { buildHealingPrompt } from './prompt-builder';

interface LlmLocatorResponse {
  new_locator: string | null;
}

/**
 * Mem-parsing JSON dari respons mentah LLM secara aman.
 *
 * Menangani dua kasus:
 * 1. Respons bersih: '{"new_locator": "..."}'
 * 2. Respons kotor: LLM menyertakan teks/markdown di luar JSON (fallback via regex)
 */
function parseLocatorResponse(raw: string): string | null {
  // Kasus 1: respons bersih — langsung parse
  try {
    const parsed = JSON.parse(raw.trim()) as LlmLocatorResponse;
    return parsed.new_locator ?? null;
  } catch {
    // Kasus 2: ada teks di luar JSON — coba ekstrak dengan regex
    const match = raw.match(/\{\s*"new_locator"\s*:\s*(?:"[^"]*"|null)\s*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as LlmLocatorResponse;
        return parsed.new_locator ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * LlmClient bertanggung jawab memanggil OpenAI API secara asinkron
 * untuk mendapatkan locator pengganti saat locator lama gagal.
 *
 * Diinstansiasi oleh HealingOrchestrator (Phase 3) yang sudah punya config.
 */
export class LlmClient {
  private readonly client: OpenAI;

  constructor(private readonly config: SelfHealingConfig) {
    this.client = new OpenAI({ apiKey: config.openai.apiKey });
  }

  /**
   * Mengirim HealingContext ke LLM dan mengembalikan selector baru.
   *
   * @param context - Konteks kegagalan dari wrapper (termasuk domSnapshot)
   * @returns       - Selector baru sebagai string, atau null jika LLM tidak menemukan
   */
  async getHealedLocator(context: HealingContext): Promise<string | null> {
    const cleanedDom = cleanDom(context.domSnapshot, this.config.healing.domMaxChars);
    const prompt = buildHealingPrompt(context, cleanedDom);

    logger.info('[llm-client] Mengirim permintaan ke OpenAI', {
      model: this.config.openai.model,
      domChars: cleanedDom.length,
      selector: context.descriptor.selector,
      testName: context.descriptor.testName,
    });

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.openai.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.openai.maxTokens,
        temperature: this.config.openai.temperature,
      });

      const rawContent = response.choices[0]?.message?.content ?? '';

      logger.debug('[llm-client] Respons mentah dari LLM', {
        raw: rawContent,
        selector: context.descriptor.selector,
      });

      const newLocator = parseLocatorResponse(rawContent);

      if (newLocator) {
        logger.info('[llm-client] LLM berhasil menghasilkan locator baru', {
          oldLocator: context.descriptor.selector,
          newLocator,
        });
      } else {
        logger.warn('[llm-client] LLM tidak menemukan locator pengganti', {
          oldLocator: context.descriptor.selector,
          rawResponse: rawContent,
        });
      }

      return newLocator;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[llm-client] Gagal memanggil OpenAI API', {
        error: errorMessage,
        selector: context.descriptor.selector,
      });
      return null;
    }
  }
}
