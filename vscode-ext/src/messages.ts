// ============================================================
// 拡張 ↔ Webview のメッセージ定義
// Web側の src/vscode.ts と対になっている。片方を変えたら必ず両方直すこと。
//
// このプロトコルはテキストベース。YAML(*.awsarch.yaml) / JSON(*.awsdiagram.json)
// の解釈と生成はすべてWebview側（archfileがバンドル済み）が担当し、
// 拡張ホストはドキュメントの生テキストを運ぶだけでフォーマットを知らない。
// ============================================================

/** ドキュメントの記法。拡張がファイル名から判定してWebviewへ伝える */
export type DocumentLanguage = 'yaml' | 'json';

/** Webview → 拡張 */
export type ToExtensionMessage =
  | { type: 'ready' }
  | { type: 'diagramChanged'; text: string }
  | { type: 'writeFiles'; files: Record<string, string> };

/** 拡張 → Webview */
export type ToWebviewMessage = { type: 'init'; text: string; language: DocumentLanguage };

/** ファイル名から記法を判定する（*.awsarch.yaml / *.yaml / *.yml はYAML、それ以外はJSON） */
export function detectLanguage(fileName: string): DocumentLanguage {
  const lower = fileName.toLowerCase();
  const isYaml = lower.endsWith('.awsarch.yaml') || lower.endsWith('.yaml') ||
    lower.endsWith('.yml');
  return isYaml ? 'yaml' : 'json';
}

/** 受信メッセージが既知の形式かを判定する（Webviewからの入力は信用しない） */
export function isToExtensionMessage(value: unknown): value is ToExtensionMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { type?: unknown; text?: unknown; files?: unknown };
  switch (message.type) {
    case 'ready':
      return true;
    case 'diagramChanged':
      return typeof message.text === 'string';
    case 'writeFiles':
      return typeof message.files === 'object' && message.files !== null;
    default:
      return false;
  }
}
