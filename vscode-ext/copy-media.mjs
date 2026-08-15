// ルートのViteビルド成果物（dist/）を vscode-ext/media/ へコピーする。
// Webviewの localResourceRoots は拡張ディレクトリ配下しか指定できないため、
// リポジトリルートの dist/ をそのまま参照せずコピーして使う。
import { access, cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extDir = dirname(fileURLToPath(import.meta.url));
const source = resolve(extDir, '..', 'dist');
const target = resolve(extDir, 'media');

try {
  await access(source);
} catch {
  console.error(
    `[copy-media] ルートの dist/ が見つかりません: ${source}\n` +
      '先にリポジトリルートで `deno task build` を実行してください。',
  );
  process.exit(1);
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`[copy-media] ${source} -> ${target}`);
