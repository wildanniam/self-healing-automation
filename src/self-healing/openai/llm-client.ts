import OpenAI from 'openai';
import type { HealingContext } from '../types';
import type { SelfHealingConfig } from '../config';
import { logger } from '../logger';
import { cleanDom } from './dom-cleaner';
import { buildHealingPrompt } from './prompt-builder';
import { appendTrace } from './llm-tracer';
import { calculateCost, formatCost } from './pricing';

interface LlmLocatorResponse {
  new_locator: string | null;
}

export interface LlmCallResult {
  locator: string | null;
  usage?: {
    promptTokens:     number;
    completionTokens: number;
    totalTokens:      number;
    costUsd:          number;
  };
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
  async getHealedLocator(context: HealingContext): Promise<LlmCallResult> {
    const cleanedDom = cleanDom(context.domSnapshot, this.config.healing.domMaxChars);
    const prompt = buildHealingPrompt(context, cleanedDom);
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    logger.info('[llm-client] Mengirim permintaan ke OpenAI', {
      model: this.config.openai.model,
      domChars: cleanedDom.length,
      selector: context.descriptor.selector,
      testName: context.descriptor.testName,
    });

    let rawContent = '';
    let newLocator: string | null = null;
    let promptTokens:     number | undefined;
    let completionTokens: number | undefined;
    let totalTokens:      number | undefined;
    let costUsd:          number | undefined;

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.openai.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: this.config.openai.maxTokens,
        temperature: this.config.openai.temperature,
      });

      rawContent = response.choices[0]?.message?.content ?? '';

      // Capture token usage & hitung biaya
      if (response.usage) {
        promptTokens     = response.usage.prompt_tokens;
        completionTokens = response.usage.completion_tokens;
        totalTokens      = response.usage.total_tokens;
        costUsd          = calculateCost(this.config.openai.model, promptTokens, completionTokens);
      }

      logger.debug('[llm-client] Respons mentah dari LLM', {
        raw: rawContent,
        selector: context.descriptor.selector,
      });

      newLocator = parseLocatorResponse(rawContent);

      if (newLocator) {
        logger.info('[llm-client] LLM berhasil menghasilkan locator baru', {
          oldLocator: context.descriptor.selector,
          newLocator,
          ...(totalTokens !== undefined && { tokens: totalTokens }),
          ...(costUsd !== undefined     && { cost:   formatCost(costUsd) }),
        });
      } else {
        logger.warn('[llm-client] LLM tidak menemukan locator pengganti', {
          oldLocator: context.descriptor.selector,
          rawResponse: rawContent,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('[llm-client] Gagal memanggil OpenAI API', {
        error: errorMessage,
        selector: context.descriptor.selector,
      });
      rawContent = `[ERROR] ${errorMessage}`;
    }

    // Selalu append trace (sukses maupun gagal) — di-aggregate jadi
    // HTML report di akhir test run oleh results-store.
    try {
      appendTrace({
        timestamp,
        testName:      context.descriptor.testName,
        ...(context.descriptor.stepName !== undefined && { stepName: context.descriptor.stepName }),
        pageUrl:       context.pageUrl,
        oldLocator:    context.descriptor.selector,
        errorMessage:  context.errorMessage,
        model:         this.config.openai.model,
        domChars:      cleanedDom.length,
        prompt,
        rawResponse:   rawContent,
        parsedLocator: newLocator,
        durationMs:    Date.now() - startTime,
        ...(promptTokens     !== undefined && { promptTokens     }),
        ...(completionTokens !== undefined && { completionTokens }),
        ...(totalTokens      !== undefined && { totalTokens      }),
        ...(costUsd          !== undefined && { costUsd          }),
      });
    } catch (traceErr) {
      logger.warn('[llm-client] Gagal menyimpan trace LLM', {
        error: traceErr instanceof Error ? traceErr.message : String(traceErr),
      });
    }

    const result: LlmCallResult = { locator: newLocator };
    if (
      promptTokens     !== undefined &&
      completionTokens !== undefined &&
      totalTokens      !== undefined &&
      costUsd          !== undefined
    ) {
      result.usage = { promptTokens, completionTokens, totalTokens, costUsd };
    }
    return result;
  }
}
