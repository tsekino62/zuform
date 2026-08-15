import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  // 相対パス出力。VSCodeのWebviewはファイルを vscode-webview-resource:// 経由で読むため
  // 絶対パス（/assets/...）だと解決できない。静的ホスティングでも相対パスで問題ない。
  base: './',
  plugins: [react()],
});
