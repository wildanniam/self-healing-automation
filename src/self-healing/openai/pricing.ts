/**
 * Tabel harga OpenAI untuk model yang di-support self-healing system.
 *
 * Harga dalam USD per 1 juta token (1M tokens), dipisah input vs output
 * sesuai skema billing OpenAI. Update tabel ini saat OpenAI mengubah harga.
 *
 * Sumber: https://openai.com/api/pricing/  (per Q1 2025)
 */

export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPer1M:  number;
  /** USD per 1M output tokens */
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  'gpt-4o':         { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gpt-4o-mini':    { inputPer1M: 0.15, outputPer1M: 0.60  },
  'gpt-3.5-turbo':  { inputPer1M: 0.50, outputPer1M: 1.50  },
};

/**
 * Hitung biaya satu pemanggilan LLM dalam USD.
 *
 * @param model            - Nama model OpenAI (cth: 'gpt-4o-mini')
 * @param promptTokens     - Jumlah token input
 * @param completionTokens - Jumlah token output
 * @returns                  Biaya dalam USD (number, full precision)
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const pricing = PRICING[model] ?? PRICING['gpt-4o-mini']!;
  const inputCost  = (promptTokens     / 1_000_000) * pricing.inputPer1M;
  const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;
  return inputCost + outputCost;
}

/**
 * Format cost USD jadi string yang mudah dibaca manusia.
 * Untuk angka kecil (< $0.01) tampilkan dalam micro-dollar (¢¢) untuk presisi.
 *
 * @param costUsd - Biaya dalam USD
 * @returns        String terformat (cth: "$0.0023" atau "$1.23")
 */
export function formatCost(costUsd: number): string {
  if (costUsd === 0) return '$0.00';
  if (costUsd < 0.0001) return `$${costUsd.toExponential(2)}`;
  if (costUsd < 0.01) return `$${costUsd.toFixed(6)}`;
  if (costUsd < 1)    return `$${costUsd.toFixed(4)}`;
  return `$${costUsd.toFixed(2)}`;
}

/**
 * Konversi USD ke IDR untuk audience Indonesia (estimasi kasar).
 * Default rate: 1 USD = 16,000 IDR (asumsi konservatif untuk demo).
 * Bisa di-override via env var USD_TO_IDR.
 */
export function formatCostIdr(costUsd: number): string {
  const rate = parseFloat(process.env['USD_TO_IDR'] ?? '16000');
  const idr  = costUsd * rate;
  if (idr < 1) return `Rp ${idr.toFixed(2)}`;
  if (idr < 1000) return `Rp ${idr.toFixed(0)}`;
  return `Rp ${Math.round(idr).toLocaleString('id-ID')}`;
}
