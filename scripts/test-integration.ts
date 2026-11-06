import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.TEST_PORT || 3191);
const url = `http://127.0.0.1:${port}`;
const env = {
  ...process.env, PORT: String(port), TRUST_PROXY: '1', VOICE_SERVERS: 'Bên A',
  APP_SERVERS: JSON.stringify({ 'Bên A': 'ci-secret', 'Bên B': 'ci-secret-b' }),
  APP_PASSWORD: 'ci-secret', OTHER_PASSWORD: 'ci-secret-b',
};
const server = spawn(process.execPath, ['server/dist/index.js'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
server.stdout.pipe(process.stdout);
server.stderr.pipe(process.stderr);
let exited = false;
server.once('exit', () => { exited = true; });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (exited) throw new Error('Integration server exited before becoming healthy');
    try { ready = (await fetch(url + '/health')).ok; } catch { /* booting */ }
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('Integration server health check timed out');
  const test = spawn(process.execPath, ['--import', 'tsx', 'server/test/e2e.ts', url], { cwd, env, stdio: 'inherit', windowsHide: true });
  const code = await new Promise<number>((resolve, reject) => {
    test.once('error', reject);
    test.once('exit', (code) => resolve(code ?? 1));
  });
  if (code) process.exitCode = code;
} finally {
  if (!exited) {
    server.kill();
    await new Promise<void>((resolve) => server.once('exit', () => resolve()));
  }
}
