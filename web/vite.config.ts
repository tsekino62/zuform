import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const coreDir = new URL('../core/', import.meta.url);

// Denoワークスペースの `@zuform/core` は deno.json の name/exports で解決されるが、
// Viteはそれを知らない（node_modules にもリンクされない）。
// そのため core/deno.json の exports をそのままエイリアスへ写して解決させる。
// 定義を二重に書かないので、exports を増やしてもこのファイルの修正は不要。
const coreManifest = JSON.parse(
  readFileSync(new URL('deno.json', coreDir), 'utf-8'),
) as { name: string; exports: Record<string, string> };

const coreAliases = Object.entries(coreManifest.exports).map(([subpath, file]) => ({
  find: `${coreManifest.name}${subpath.replace(/^\./, '')}`,
  replacement: fileURLToPath(new URL(file, coreDir)),
}));

// https://vite.dev/config/
export default defineConfig({
  // 相対パス出力。VSCodeのWebviewはファイルを vscode-webview-resource:// 経由で読むため
  // 絶対パス（/assets/...）だと解決できない。静的ホスティングでも相対パスで問題ない。
  base: './',
  // Viteのルートが web/ になり、その直下に node_modules が無いため、
  // 既定では web/.vite/ にキャッシュが作られてしまう。
  // 従来どおりリポジトリルートの node_modules/.vite/ に置く（gitignore済み）。
  cacheDir: fileURLToPath(new URL('node_modules/.vite', new URL('../', import.meta.url))),
  plugins: [react()],
  resolve: {
    alias: coreAliases,
  },
  server: {
    // core/ は web/ の外にあるので、devサーバーの配信許可をリポジトリルートまで広げる
    fs: {
      allow: [repoRoot],
    },
  },
});
