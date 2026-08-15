// ============================================================
// Webview用HTMLの組み立て
//
// Viteが media/index.html に出力するのは次のような相対参照:
//   <script type="module" crossorigin src="./assets/index-XXXX.js"></script>
//   <link rel="stylesheet" crossorigin href="./assets/index-XXXX.css">
// Webviewでは file:// を直接読めないため、これらを webview.asWebviewUri() が返す
// vscode-webview-resource 系のURIへ書き換え、あわせてCSPを差し込む。
//
// なお JS 内から参照されるSVG等は Vite が `new URL("./xxx.svg", import.meta.url)`
// 形式で解決する（vite.config.ts の base: './' が前提）。スクリプト自体が
// media/assets/ 配下のURIとして読み込まれるため、相対解決の結果も正しいURIになる。
// ============================================================

import * as vscode from 'vscode';

const MEDIA_DIR = 'media';

/** media/ が未生成のときに表示する案内（F5デバッグでの詰まりどころ） */
function missingMediaHtml(): string {
  return `<!doctype html>
<html lang="ja">
  <head><meta charset="UTF-8" /></head>
  <body style="font-family: sans-serif; padding: 24px; line-height: 1.8;">
    <h2>UIのビルド成果物が見つかりません</h2>
    <p>次の手順でビルドしてから、もう一度エディタを開き直してください。</p>
    <pre style="background: rgba(127,127,127,0.15); padding: 12px;">
# リポジトリルートで
deno task build

# 拡張ディレクトリで
cd vscode-ext &amp;&amp; npm run build</pre>
  </body>
</html>`;
}

export async function buildWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): Promise<string> {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, MEDIA_DIR);
  const indexUri = vscode.Uri.joinPath(mediaRoot, 'index.html');

  let html: string;
  try {
    const bytes = await vscode.workspace.fs.readFile(indexUri);
    html = new TextDecoder().decode(bytes);
  } catch {
    return missingMediaHtml();
  }

  // 1) "./assets/xxx" などの相対参照をWebview用URIへ書き換える
  html = html.replace(
    /\b(src|href)="\.\/([^"]+)"/g,
    (_match, attribute: string, relativePath: string) => {
      const uri = webview.asWebviewUri(
        vscode.Uri.joinPath(mediaRoot, ...relativePath.split('/')),
      );
      return `${attribute}="${uri.toString()}"`;
    },
  );

  // 2) crossorigin属性を落とす。Webviewのリソースは別オリジン扱いのため、
  //    CORSヘッダのないレスポンスだと crossorigin 付きの読み込みが失敗しうる。
  html = html.replace(/\scrossorigin(="[^"]*")?/g, '');

  // 3) CSPを<head>直後に挿入。Viteのスクリプトはハッシュ付きファイルとして
  //    配信されるので nonce は不要で、cspSource の許可だけで足りる。
  //    スタイルは React Flow などが動的に <style> を差し込むため 'unsafe-inline' が必要。
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource}`,
  ].join('; ');
  html = html.replace(
    '<head>',
    `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp};" />`,
  );

  return html;
}
