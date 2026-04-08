/**
 * Demo Runner — Single-command demo untuk presentasi tugas akhir.
 *
 * Flow:
 *   1. Tampilkan banner
 *   2. Jalankan: playwright test --headed tests/self-healing-demo.spec.ts
 *      (dengan DEMO_MODE=true agar output pretty)
 *   3. Jalankan: post-heal flow (patch → git → PR)
 *
 * Cara pakai:
 *   npm run demo
 */

import { spawn } from 'child_process';
import * as path from 'path';
import 'dotenv/config';

const ROOT = path.resolve(__dirname, '..');
const LINE = '═'.repeat(56);

function banner(): void {
  console.log(`\n╔${LINE}╗`);
  console.log(`║   SELF-HEALING TEST AUTOMATION — DEMO MODE          ║`);
  console.log(`║   Sistem akan menjalankan test dan memperbaiki       ║`);
  console.log(`║   locator yang rusak secara otomatis.                ║`);
  console.log(`╚${LINE}╝\n`);
}

function separator(label: string): void {
  const pad = Math.max(0, 54 - label.length);
  const left  = Math.floor(pad / 2);
  const right = pad - left;
  console.log(`\n${'─'.repeat(left)}  ${label}  ${'─'.repeat(right)}\n`);
}

function run(
  cmd: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd:   ROOT,
      env:   { ...process.env, ...env },
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 0));
  });
}

async function main(): Promise<void> {
  banner();

  // ── Step 1: Run Playwright tests (headed + demo mode) ──────────────────────
  separator('MENJALANKAN TEST — BROWSER VISIBLE');

  const testArgs = [
    'playwright', 'test',
    'tests/self-healing-demo.spec.ts',
    '--headed',
    '--project=chromium',
    '--workers=1',
    '--reporter=list',
  ];

  const testCode = await run('npx', testArgs, { DEMO_MODE: 'true' });

  if (testCode !== 0) {
    console.log(`\n⚠️   Playwright selesai dengan exit code ${testCode}.`);
    console.log(`    (Normal jika ada locator yang sengaja dirusak — lihat healing di atas)\n`);
  }

  // ── Step 2: Post-heal (patch + git + PR) ───────────────────────────────────
  separator('POST-HEAL — PATCH · GIT · PULL REQUEST');

  const postHealArgs = ['ts-node', 'scripts/post-heal.ts'];

  const postHealCode = await run('npx', postHealArgs, {
    DEMO_MODE:     'true',
    GITHUB_TOKEN:  process.env['GITHUB_TOKEN']  ?? '',
    GITHUB_REPO:   process.env['GITHUB_REPO']   ?? '',
  });

  if (postHealCode !== 0) {
    console.log(`\n⚠️   Post-heal selesai dengan exit code ${postHealCode}.\n`);
  }

  separator('DEMO SELESAI');
  console.log(`✅  Semua langkah demo telah selesai dijalankan.\n`);
}

main().catch(err => {
  console.error(`\n🔴  Demo error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
