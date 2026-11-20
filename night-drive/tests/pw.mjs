// Resolves Playwright from the project or from a global install (CI images often ship it globally).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  const root = execSync('npm root -g').toString().trim();
  pw = require(`${root}/playwright`);
}
export const { chromium } = pw;
// Software WebGL (SwiftShader) so tests run on machines without a GPU.
export const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
