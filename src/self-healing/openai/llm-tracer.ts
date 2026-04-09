/**
 * LlmTracer — Mengumpulkan input/output LLM dari setiap healing call dan
 * menghasilkan satu HTML report yang nyaman dibaca di akhir test run.
 *
 * Alur:
 *   1. Setiap kali llm-client memanggil OpenAI, ia memanggil `appendTrace()`
 *      yang meng-append 1 baris JSON ke `healing-results/llm-traces.jsonl`.
 *   2. Setelah test run selesai, `results-store.saveToFile()` memanggil
 *      `generateHtmlReport()` yang membaca seluruh JSONL, merender HTML
 *      self-contained, lalu menghapus JSONL.
 *
 * Output akhir: ./healing-results/trace-report.html
 *   - Self-contained (inline CSS + JS, no external deps)
 *   - Collapsible per healing call dengan tab Input/Output/Parsed/Meta
 *   - Header summary stats
 *   - Bisa di-share lewat zip/email tanpa dependency
 */

import * as fs from 'fs';
import * as path from 'path';
import { formatCost, formatCostIdr } from './pricing';

const TRACE_DIR  = path.resolve(process.cwd(), 'healing-results');
const TRACE_FILE = path.join(TRACE_DIR, 'llm-traces.jsonl');

export interface LlmTrace {
  timestamp:    string;
  testName:     string;
  stepName?:    string;
  pageUrl:      string;
  oldLocator:   string;
  errorMessage: string;
  model:        string;
  domChars:     number;
  prompt:       string;
  rawResponse:  string;
  parsedLocator: string | null;
  durationMs:   number;
  /** Token & biaya — opsional karena bisa null kalau API gagal sebelum response */
  promptTokens?:     number;
  completionTokens?: number;
  totalTokens?:      number;
  costUsd?:          number;
}

// ── Append (per LLM call) ─────────────────────────────────────────────────────

/**
 * Append 1 trace ke JSONL. Append-safe untuk multi-worker Playwright
 * (POSIX append atomik untuk write < ~4KB; prompt biasanya 5-10KB tapi
 * worker count rendah & retry-loop kecil, conflict sangat jarang).
 */
export function appendTrace(trace: LlmTrace): void {
  try {
    if (!fs.existsSync(TRACE_DIR)) {
      fs.mkdirSync(TRACE_DIR, { recursive: true });
    }
    const line = JSON.stringify(trace) + '\n';
    fs.appendFileSync(TRACE_FILE, line, 'utf-8');
  } catch (err) {
    // Retry sekali — handle race condition di multi-worker
    try {
      fs.appendFileSync(TRACE_FILE, JSON.stringify(trace) + '\n', 'utf-8');
    } catch {
      // Silent fail — tracing tidak boleh memblokir healing flow
      void err;
    }
  }
}

// ── HTML Report Generation ────────────────────────────────────────────────────

/**
 * Baca semua trace dari JSONL, render HTML self-contained, simpan ke disk,
 * dan hapus JSONL setelahnya.
 *
 * @param outputPath - Path output HTML (default: healing-results/trace-report.html)
 * @returns           Path file HTML, atau null jika tidak ada trace
 */
export function generateHtmlReport(
  outputPath = path.join(TRACE_DIR, 'trace-report.html'),
): string | null {
  if (!fs.existsSync(TRACE_FILE)) {
    return null;
  }

  const raw = fs.readFileSync(TRACE_FILE, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);

  const traces: LlmTrace[] = [];
  for (const line of lines) {
    try {
      traces.push(JSON.parse(line) as LlmTrace);
    } catch {
      // Skip baris korup tanpa fail keseluruhan
    }
  }

  if (traces.length === 0) {
    return null;
  }

  const html = renderHtml(traces);
  fs.writeFileSync(outputPath, html, 'utf-8');

  // Cleanup JSONL setelah HTML berhasil ditulis
  try {
    fs.unlinkSync(TRACE_FILE);
  } catch {
    // ignore
  }

  return path.relative(process.cwd(), outputPath);
}

// ── HTML Renderer ─────────────────────────────────────────────────────────────

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function computeStats(traces: LlmTrace[]) {
  const total  = traces.length;
  const healed = traces.filter(t => t.parsedLocator !== null).length;
  const failed = total - healed;
  const rate   = total > 0 ? `${((healed / total) * 100).toFixed(1)}%` : 'N/A';
  const avgMs  = total > 0
    ? Math.round(traces.reduce((a, t) => a + t.durationMs, 0) / total)
    : 0;

  const totalPromptTokens     = traces.reduce((a, t) => a + (t.promptTokens     ?? 0), 0);
  const totalCompletionTokens = traces.reduce((a, t) => a + (t.completionTokens ?? 0), 0);
  const totalTokens           = totalPromptTokens + totalCompletionTokens;
  const totalCostUsd          = traces.reduce((a, t) => a + (t.costUsd ?? 0), 0);
  const avgCostUsd            = total > 0 ? totalCostUsd / total : 0;

  return {
    total, healed, failed, rate, avgMs,
    totalPromptTokens, totalCompletionTokens, totalTokens,
    totalCostUsd, avgCostUsd,
  };
}

function renderHtml(traces: LlmTrace[]): string {
  const stats = computeStats(traces);
  const generatedAt = new Date().toISOString();

  const items = traces
    .map((t, idx) => renderTraceItem(t, idx))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Self-Healing LLM Trace Report</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: #0d1117;
  color: #c9d1d9;
  line-height: 1.5;
}
header {
  padding: 32px 40px 24px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
}
header h1 {
  margin: 0 0 8px;
  font-size: 24px;
}
header p {
  margin: 0 0 20px;
  color: #8b949e;
  font-size: 13px;
}
.stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.stat {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 6px;
  padding: 12px 20px;
  min-width: 130px;
}
.stat b {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #8b949e;
  margin-bottom: 4px;
}
.stat span {
  font-size: 22px;
  font-weight: 600;
  color: #f0f6fc;
}
.stat.success span { color: #3fb950; }
.stat.fail    span { color: #f85149; }
main {
  padding: 24px 40px 60px;
  max-width: 1200px;
}
.trace {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  margin-bottom: 12px;
  overflow: hidden;
}
.trace summary {
  cursor: pointer;
  padding: 14px 20px;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  user-select: none;
}
.trace summary::-webkit-details-marker { display: none; }
.trace summary:hover { background: #1c2128; }
.trace summary .icon { font-size: 18px; }
.trace summary code {
  background: #0d1117;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid #30363d;
  font-size: 12px;
  color: #79c0ff;
}
.trace summary .arrow { color: #6e7681; margin: 0 2px; }
.trace summary .meta {
  margin-left: auto;
  color: #8b949e;
  font-size: 12px;
}
.trace.healed { border-left: 3px solid #3fb950; }
.trace.fail   { border-left: 3px solid #f85149; }
.tabs {
  display: flex;
  gap: 0;
  border-top: 1px solid #30363d;
  background: #0d1117;
}
.tabs button {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #8b949e;
  padding: 10px 18px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.tabs button:hover { color: #c9d1d9; }
.tabs button.active {
  color: #f0f6fc;
  border-bottom-color: #58a6ff;
}
.panel {
  display: none;
  margin: 0;
  padding: 18px 20px;
  background: #0d1117;
  font-family: "SF Mono", Menlo, Monaco, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 600px;
  overflow: auto;
  color: #c9d1d9;
}
.panel.active { display: block; }
.meta-table {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 20px;
  font-family: inherit;
  font-size: 13px;
  white-space: normal;
}
.meta-table b { color: #8b949e; font-weight: 500; }
footer {
  text-align: center;
  padding: 20px;
  color: #6e7681;
  font-size: 12px;
  border-top: 1px solid #30363d;
}
</style>
</head>
<body>
<header>
  <h1>🩺 Self-Healing LLM Trace Report</h1>
  <p>Generated: ${escape(generatedAt)}</p>
  <div class="stats">
    <div class="stat"><b>Total Calls</b><span>${stats.total}</span></div>
    <div class="stat success"><b>Healed</b><span>${stats.healed}</span></div>
    <div class="stat fail"><b>Failed</b><span>${stats.failed}</span></div>
    <div class="stat"><b>Success Rate</b><span>${escape(stats.rate)}</span></div>
    <div class="stat"><b>Avg Duration</b><span>${stats.avgMs} ms</span></div>
  </div>
  <div class="stats" style="margin-top:12px;">
    <div class="stat"><b>Total Tokens</b><span>${stats.totalTokens.toLocaleString('en-US')}</span></div>
    <div class="stat"><b>Input Tokens</b><span>${stats.totalPromptTokens.toLocaleString('en-US')}</span></div>
    <div class="stat"><b>Output Tokens</b><span>${stats.totalCompletionTokens.toLocaleString('en-US')}</span></div>
    <div class="stat success"><b>Total Cost</b><span>${escape(formatCost(stats.totalCostUsd))}</span></div>
    <div class="stat"><b>Total Cost (IDR)</b><span>${escape(formatCostIdr(stats.totalCostUsd))}</span></div>
    <div class="stat"><b>Avg / Locator</b><span>${escape(formatCost(stats.avgCostUsd))}</span></div>
  </div>
</header>
<main>
${items}
</main>
<footer>
  Self-Healing Test Automation · LLM Trace Report
</footer>
<script>
document.querySelectorAll('.trace').forEach(function(trace) {
  var buttons = trace.querySelectorAll('.tabs button');
  var panels  = trace.querySelectorAll('.panel');
  buttons.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var target = btn.getAttribute('data-tab');
      buttons.forEach(function(b) { b.classList.remove('active'); });
      panels.forEach(function(p)  { p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = trace.querySelector('.panel.' + target);
      if (panel) panel.classList.add('active');
    });
  });
});
</script>
</body>
</html>
`;
}

function renderTraceItem(t: LlmTrace, idx: number): string {
  const isHealed = t.parsedLocator !== null;
  const cls = isHealed ? 'healed' : 'fail';
  const icon = isHealed ? '✅' : '❌';
  const newLoc = isHealed ? escape(t.parsedLocator!) : '<i>null</i>';

  const parsedJson = JSON.stringify(
    { new_locator: t.parsedLocator },
    null,
    2,
  );

  const tokenInfo = t.totalTokens !== undefined
    ? `${t.totalTokens.toLocaleString('en-US')} (in: ${(t.promptTokens ?? 0).toLocaleString('en-US')}, out: ${(t.completionTokens ?? 0).toLocaleString('en-US')})`
    : '(tidak tersedia)';
  const costInfo = t.costUsd !== undefined
    ? `${formatCost(t.costUsd)} · ${formatCostIdr(t.costUsd)}`
    : '(tidak tersedia)';

  const metaHtml = `<div class="meta-table">
  <b>Test Name</b><span>${escape(t.testName)}</span>
  <b>Step Name</b><span>${escape(t.stepName ?? '(tidak ada)')}</span>
  <b>Page URL</b><span>${escape(t.pageUrl)}</span>
  <b>Model</b><span>${escape(t.model)}</span>
  <b>DOM Chars</b><span>${t.domChars}</span>
  <b>Duration</b><span>${t.durationMs} ms</span>
  <b>Tokens</b><span>${escape(tokenInfo)}</span>
  <b>Cost</b><span>${escape(costInfo)}</span>
  <b>Timestamp</b><span>${escape(t.timestamp)}</span>
  <b>Error Msg</b><span>${escape(t.errorMessage)}</span>
</div>`;

  const tokenChip = t.totalTokens !== undefined
    ? ` · ${t.totalTokens.toLocaleString('en-US')} tokens`
    : '';
  const costChip = t.costUsd !== undefined
    ? ` · ${formatCost(t.costUsd)}`
    : '';

  return `<details class="trace ${cls}">
  <summary>
    <span class="icon">${icon}</span>
    <code>${escape(t.oldLocator)}</code>
    <span class="arrow">→</span>
    <code>${newLoc}</code>
    <span class="meta">${t.durationMs}ms${escape(tokenChip)}${escape(costChip)} · ${escape(t.testName)}</span>
  </summary>
  <div class="tabs">
    <button data-tab="input"  class="active">📤 Input</button>
    <button data-tab="output">📥 Output</button>
    <button data-tab="parsed">✅ Parsed</button>
    <button data-tab="meta">📋 Meta</button>
  </div>
  <pre class="panel input active">${escape(t.prompt)}</pre>
  <pre class="panel output">${escape(t.rawResponse)}</pre>
  <pre class="panel parsed">${escape(parsedJson)}</pre>
  <div class="panel meta">${metaHtml}</div>
</details>${idx < 0 ? '' : ''}`;
}
