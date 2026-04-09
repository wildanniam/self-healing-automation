type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
}

const DEMO_MODE = process.env['DEMO_MODE'] === 'true';

// ── Pretty printer helpers ────────────────────────────────────────────────────

const SEP  = '─'.repeat(52);
const LINE = '═'.repeat(52);

function prettyHealSuccess(data: Record<string, unknown>): void {
  const old    = data['oldLocator']  as string | undefined;
  const healed = data['newLocator']  as string | undefined;
  const test   = data['testName']    as string | undefined;
  const ms     = data['durationMs']  as number | undefined;
  const retry  = data['attempt']     as number | undefined;
  const max    = data['maxRetries']  as number | undefined;
  const tokens = data['tokens']      as number | undefined;
  const cost   = data['cost']        as string | undefined;

  console.log(`\n${SEP}`);
  console.log(` ✅ HEALED  ${old ?? '?'}  →  ${healed ?? '?'}`);
  console.log(`${SEP}`);
  if (test)             console.log(`  Test    : ${test}`);
  if (ms)               console.log(`  Waktu   : ${ms.toFixed(0)} ms`);
  if (retry)            console.log(`  Retry   : ${retry}/${max ?? '?'}`);
  if (tokens)           console.log(`  Tokens  : ${tokens.toLocaleString('en-US')}`);
  if (cost)             console.log(`  Biaya   : ${cost}`);
  console.log(`${SEP}\n`);
}

function prettyHealFail(data: Record<string, unknown>): void {
  const old    = data['oldLocator'] as string | undefined;
  const max    = data['maxRetries'] as number | undefined;
  const tokens = data['tokens']     as number | undefined;
  const cost   = data['cost']       as string | undefined;

  console.log(`\n${SEP}`);
  console.log(` ❌ FAILED  ${old ?? '?'}  (${max ?? 3}x percobaan habis)`);
  console.log(`${SEP}`);
  if (tokens) console.log(`  Tokens  : ${tokens.toLocaleString('en-US')}`);
  if (cost)   console.log(`  Biaya   : ${cost}`);
  console.log(`${SEP}\n`);
}

function prettySummary(data: Record<string, unknown>): void {
  const healed     = data['healed']            as number | undefined ?? 0;
  const failed     = data['failed']            as number | undefined ?? 0;
  const rate       = data['successRate']       as string | undefined ?? '0%';
  const avg        = data['avgMs']             as number | undefined;
  const tokens     = data['totalTokens']       as number | undefined;
  const totalCost  = data['totalCost']         as string | undefined;
  const totalCostId = data['totalCostIdr']     as string | undefined;
  const avgCost    = data['avgCostPerLocator'] as string | undefined;

  console.log(`\n╔${LINE}╗`);
  console.log(`║         SELF-HEALING SUMMARY                       ║`);
  console.log(`╠${LINE}╣`);
  console.log(`║  Total Healed   : ${String(healed).padEnd(33)}║`);
  console.log(`║  Total Failed   : ${String(failed).padEnd(33)}║`);
  console.log(`║  Success Rate   : ${rate.padEnd(33)}║`);
  if (avg !== undefined) {
    console.log(`║  Rata-rata      : ${(avg.toFixed(0) + ' ms / locator').padEnd(33)}║`);
  }
  if (tokens !== undefined) {
    console.log(`║  Total Tokens   : ${tokens.toLocaleString('en-US').padEnd(33)}║`);
  }
  if (totalCost) {
    console.log(`║  Total Biaya    : ${totalCost.padEnd(33)}║`);
  }
  if (totalCostId) {
    console.log(`║  Total (IDR)    : ${totalCostId.padEnd(33)}║`);
  }
  if (avgCost) {
    console.log(`║  Per Locator    : ${avgCost.padEnd(33)}║`);
  }
  console.log(`╚${LINE}╝\n`);
}

function prettyPostHeal(message: string, data: Record<string, unknown>): void {
  if (message.includes('Step 1')) {
    console.log(`\n📝  [1/3] Patching file .spec.ts...`);
  } else if (message.includes('Step 2')) {
    console.log(`\n🌿  [2/3] Membuat branch & commit ke GitHub...`);
  } else if (message.includes('Step 3')) {
    console.log(`\n🔗  [3/3] Membuat Pull Request di GitHub...`);
  } else if (message.includes('berhasil di-push')) {
    console.log(`    Branch : ${data['branch'] ?? '-'}`);
    console.log(`    Files  : ${data['committedFiles'] ?? 0} file dipatch`);
  } else if (message.includes('RINGKASAN')) {
    console.log(`\n🎉  Post-heal selesai!`);
    console.log(`    Locator dipatch : ${data['locatorDipatch'] ?? 0}`);
    console.log(`    Branch          : ${data['branch'] ?? '-'}`);
    console.log(`    PR URL          : ${data['prUrl'] ?? '(tidak dibuat)'}\n`);
  } else if (message.includes('Pull Request')) {
    const url = data['url'] as string | undefined;
    if (url) console.log(`    ✅  PR dibuat  → ${url}`);
  }
}

// ── Core log function ─────────────────────────────────────────────────────────

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!DEMO_MODE) {
    // Standard JSON log
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(data !== undefined && { data }),
    };
    const output = JSON.stringify(entry);
    if (level === 'error') { console.error(output); } else { console.log(output); }
    return;
  }

  // ── DEMO_MODE: pretty human-readable output ──────────────────────────────

  // Suppress debug & noisy internal messages
  if (level === 'debug') return;
  if (message.includes('[dom-cleaner]'))  return;
  if (message.includes('[prompt-builder]')) return;

  // Tampilkan path HTML trace report sekali di akhir test run
  if (message.includes('Trace report HTML disimpan')) {
    const p = (data ?? {})['path'];
    if (p) {
      console.log(`\n📊  Trace report → ${p}`);
      console.log(`    Buka di browser untuk lihat detail input/output LLM\n`);
    }
    return;
  }

  if (message.includes('[llm-client]') && !message.includes('Respons')) return;

  const d = data ?? {};

  // Special formatting for key events
  if (message.includes('berhasil di-heal') || message.includes('Locator healed')) {
    prettyHealSuccess(d);
    return;
  }
  if (message.includes('gagal di-heal') || message.includes('Healing failed') || message.includes('Max retries')) {
    prettyHealFail(d);
    return;
  }
  if (message.includes('SUMMARY') || message.includes('successRate') || (d['healed'] !== undefined && d['successRate'] !== undefined)) {
    prettySummary(d);
    return;
  }
  if (message.includes('[post-heal]')) {
    prettyPostHeal(message, d);
    return;
  }

  // Generic pretty log
  const icon = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : 'ℹ️ ';
  const clean = message.replace(/\[.*?\]\s*/g, '').trim();
  if (!clean) return;

  const prefix = `${icon}  ${clean}`;
  if (Object.keys(d).length > 0) {
    const detail = Object.entries(d)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('  ');
    console.log(`${prefix}  (${detail})`);
  } else {
    console.log(prefix);
  }
}

export const logger = {
  info:  (message: string, data?: Record<string, unknown>) => log('info',  message, data),
  warn:  (message: string, data?: Record<string, unknown>) => log('warn',  message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
};
