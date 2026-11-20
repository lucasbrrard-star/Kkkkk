// Sobe servidor (tsx watch) e cliente (Vite) juntos para desenvolvimento.
import { spawn } from 'node:child_process';
const run = (cmd, args, name) => {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (c) => { console.log(`[${name}] saiu (${c})`); process.exit(c ?? 0); });
  return p;
};
const s = run('npx', ['tsx', 'watch', 'server/src/index.ts'], 'servidor');
const c = run('npx', ['vite', 'client', '--host'], 'cliente');
process.on('SIGINT', () => { s.kill(); c.kill(); process.exit(0); });
