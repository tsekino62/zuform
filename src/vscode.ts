// ============================================================
// VSCode Webview ブリッジ / ドキュメントテキスト変換
//
// このファイルには2つの役割があります。
//
// 1. VSCodeのWebview内で動いているときだけ働く、拡張ホストとの橋渡し
//    （ブラウザ単体では isInVsCode() が false になり、送信系は何もしません）
// 2. 「ドキュメントのテキスト ⇄ キャンバスの図」の相互変換
//    （*.awsarch.yaml と、後方互換の *.awsdiagram.json の両方）
//    ブラウザ単体の「図を保存 / 図を開く」からも同じ関数を使い、
//    Web版とVSCode版でファイルの読み書きの挙動を一致させます。
//
// メッセージプロトコル（拡張 ↔ Webview）
//   Webview → 拡張
//     { type: 'ready' }                     … 初期表示の準備ができた（init要求）
//     { type: 'diagramChanged', text }      … 図が編集された（300msデバウンス）。
//                                             textは直列化済みのドキュメント本文
//     { type: 'writeFiles', files }         … Terraform一式をワークスペースへ書き出す
//   拡張 → Webview
//     { type: 'init', text, language }      … ドキュメントの生テキストを反映せよ。
//                                             languageはファイル名から拡張が判定した記法
//
// YAML/JSONの解釈は「すべてWebview側」で行います。拡張ホストはテキストを
// 右から左へ運ぶだけでフォーマットを知りません（archfileの実装をWebview側の
// バンドルに一本化するため）。
// ============================================================

import type { Edge } from '@xyflow/react';
import type { AwsNode, NamingConfig } from './aws/types.ts';
import { DEFAULT_NAMING } from './aws/types.ts';
import { parseArchYaml, serializeArchYaml } from './aws/archfile.ts';

/** ドキュメントの記法。拡張側はファイル名から判定して init に載せてくる */
export type DocumentLanguage = 'yaml' | 'json';

/** *.awsdiagram.json のファイル形式（旧「図を保存」の出力。読み書きとも後方互換で維持） */
export interface DiagramDocument {
  version: number;
  nodes: AwsNode[];
  edges: Edge[];
  naming: NamingConfig;
}

/** キャンバスが保持している図の中身 */
export interface DiagramModel {
  nodes: AwsNode[];
  edges: Edge[];
  naming: NamingConfig;
}

/** テキストから復元した図。warnings は日本語の軽微な警告（致命的ではない） */
export interface ParsedDiagram extends DiagramModel {
  warnings: string[];
}

/** VSCodeがWebviewへ注入するAPI（必要な分だけ型定義） */
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

type AcquireVsCodeApi = () => VsCodeApi;

/** Webview→拡張 のメッセージ */
export type ToExtensionMessage =
  | { type: 'ready' }
  | { type: 'diagramChanged'; text: string }
  | { type: 'writeFiles'; files: Record<string, string> };

/** 拡張→Webview のメッセージ */
export type ToWebviewMessage = { type: 'init'; text: string; language: DocumentLanguage };

// ------------------------------------------------------------
// ドキュメントテキスト ⇄ 図
// ------------------------------------------------------------

/**
 * ドキュメントのテキストを図として読む。
 * 致命的な問題があれば Error（日本語メッセージ）を投げるので、
 * 呼び出し側でキャンバスを壊さないように扱うこと。
 */
export function parseDiagramText(text: string, language: DocumentLanguage): ParsedDiagram {
  // YAML側は archfile が空文字・空ドキュメントも空モデルとして扱う
  if (language === 'yaml') return parseArchYaml(text);
  return parseDiagramJson(text);
}

/** 旧形式（React Flowの内部形式をそのままダンプしたJSON）を読む */
function parseDiagramJson(text: string): ParsedDiagram {
  if (text.trim() === '') {
    // 新規作成直後の空ファイル。空の図として開く
    return { nodes: [], edges: [], naming: DEFAULT_NAMING, warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`構成図のJSON構文が不正です: ${detail}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('構成図のJSONはオブジェクト形式で記述してください');
  }

  const doc = parsed as Partial<DiagramDocument>;
  if (!Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) {
    throw new Error('構成図のJSONに nodes / edges の配列が見つかりません');
  }

  return {
    nodes: doc.nodes as AwsNode[],
    edges: doc.edges as Edge[],
    naming: { ...DEFAULT_NAMING, ...(doc.naming ?? {}) },
    warnings: [],
  };
}

/** 図をドキュメントのテキストへ直列化する（記法はドキュメント側に合わせる） */
export function serializeDiagramText(model: DiagramModel, language: DocumentLanguage): string {
  if (language === 'yaml') {
    return serializeArchYaml(model.nodes, model.edges, model.naming);
  }
  const sanitized = sanitizeDiagram({ version: 2, ...model });
  return `${JSON.stringify(sanitized, null, 2)}\n`;
}

// ------------------------------------------------------------
// 拡張ホストとの橋渡し
// ------------------------------------------------------------

/**
 * acquireVsCodeApi は「1つのWebviewにつき1回しか呼べない」ため、
 * 取得結果をモジュールスコープにキャッシュする。
 * （2回目以降の呼び出しは例外になる）
 */
let cachedApi: VsCodeApi | null = null;
let apiResolved = false;

function resolveApi(): VsCodeApi | null {
  if (apiResolved) return cachedApi;
  apiResolved = true;
  const acquire = (globalThis as { acquireVsCodeApi?: AcquireVsCodeApi }).acquireVsCodeApi;
  if (typeof acquire !== 'function') {
    cachedApi = null;
    return null;
  }
  try {
    cachedApi = acquire();
  } catch {
    // 二重取得などで失敗した場合はブラウザ相当として扱う
    cachedApi = null;
  }
  return cachedApi;
}

/** VSCodeのWebview内で動作しているか */
export function isInVsCode(): boolean {
  return resolveApi() !== null;
}

function post(message: ToExtensionMessage): void {
  resolveApi()?.postMessage(message);
}

/** 初期表示の準備ができたことを拡張へ伝える（拡張はこれを受けて init を返す） */
export function postReady(): void {
  post({ type: 'ready' });
}

/**
 * Terraform一式の書き出しを拡張へ依頼する。
 * files のキーは terraform/ 配下の相対パス（例: 'environments/dev/main.tf'）。
 */
export function postWriteFiles(files: Record<string, string>): void {
  post({ type: 'writeFiles', files });
}

/**
 * 保存しないノードの一時的な状態。
 * 選択やドラッグ中フラグ、React Flowが実測して書き戻すサイズまでドキュメントに
 * 流すと、ノードをクリックしただけでファイルが「未保存」になってしまう。
 */
const VOLATILE_NODE_KEYS = ['selected', 'dragging', 'resizing', 'measured'] as const;
/** エッジ側の一時的な状態 */
const VOLATILE_EDGE_KEYS = ['selected'] as const;

function omitKeys<T extends object>(value: T, keys: readonly string[]): T {
  const result = { ...value } as Record<string, unknown>;
  for (const key of keys) delete result[key];
  return result as T;
}

/**
 * JSON形式のドキュメントへ書き出す形に正規化する。
 * 一時的なUI状態を落とすことで「見た目を変えただけの差分」を作らない。
 * （YAML形式では archfile が必要な情報だけを書き出すため、この処理は不要）
 */
export function sanitizeDiagram(diagram: DiagramDocument): DiagramDocument {
  return {
    version: diagram.version,
    nodes: diagram.nodes.map((node) => omitKeys(node, VOLATILE_NODE_KEYS)),
    edges: diagram.edges.map((edge) => omitKeys(edge, VOLATILE_EDGE_KEYS)),
    naming: diagram.naming,
  };
}

const DIAGRAM_CHANGED_DEBOUNCE_MS = 300;
let debounceTimer: number | undefined;

/**
 * 図の変更を拡張へ通知する（300msデバウンス）。
 * ドラッグ中など高頻度で呼ばれるため、最後の1回だけ直列化して送る。
 */
export function postDiagramChanged(model: DiagramModel, language: DocumentLanguage): void {
  if (!isInVsCode()) return;
  globalThis.clearTimeout(debounceTimer);
  debounceTimer = globalThis.setTimeout(() => {
    post({ type: 'diagramChanged', text: serializeDiagramText(model, language) });
  }, DIAGRAM_CHANGED_DEBOUNCE_MS);
}

/**
 * 拡張からの init メッセージを購読する。
 * 戻り値を呼ぶとリスナーを解除する（useEffectのクリーンアップで使う）。
 */
export function onInit(
  handler: (text: string, language: DocumentLanguage) => void,
): () => void {
  if (!isInVsCode()) return () => {};
  const listener = (event: MessageEvent) => {
    const message = event.data as ToWebviewMessage | undefined;
    if (!message || message.type !== 'init') return;
    if (typeof message.text !== 'string') return;
    const language: DocumentLanguage = message.language === 'yaml' ? 'yaml' : 'json';
    handler(message.text, language);
  };
  globalThis.addEventListener('message', listener);
  return () => globalThis.removeEventListener('message', listener);
}
