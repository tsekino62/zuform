// ============================================================
// UIの多言語化（i18n）
//
// このファイルが web/ のUI文言の唯一の置き場です。
// コンポーネント側に文字列リテラルを書かず、必ず t() 経由で引いてください。
//
// 対応言語は 'ja' | 'en' の2つ。
//   - ja: 既存の日本語文言（表示のもとになる正）
//   - en: 英訳
//
// core/（@zuform/core）は変更しないため、core が持つ日本語文字列
// （サービス説明・カテゴリ名・テンプレートのタイトル/説明）については
// このファイルに「対訳マップ」を持ち、lang === 'en' のときだけ差し替えます。
//
// 生成されるTerraformコードのコメントとヒント文は core 側でロケール対応済みです。
// （generateAll/generateForEnv に lang をそのまま渡します。文言の置き場は
// core/registry/*.ts と core/generator.ts の ctx.tr(ja, en) 呼び出し。）
// アーキテクチャ定義ファイルのパースエラー本文は core 由来のため日本語のままです。
// ============================================================

import { createContext, useContext } from 'react';
import type { Context } from 'react';
import type { ServiceType } from '@zuform/core/types';

/** UIの表示言語 */
export type Lang = 'ja' | 'en';

/** 表示言語の保存先（localStorage） */
export const LANG_STORAGE_KEY = 'zuform-lang';

/** t() のプレースホルダに差し込む値 */
export type TemplateVars = Record<string, string | number>;

// ------------------------------------------------------------
// 辞書
// ------------------------------------------------------------

/**
 * 日本語辞書。キーの一覧はここが正で、英語辞書は同じキーを必ず持つ
 * （Record<MessageKey, string> による型制約 + i18n_test.ts で二重に担保）。
 */
const JA = {
  // ---------- 共通 ----------
  'app.title': 'Zuform — 図を描くと Terraform ができる',
  'common.close': '閉じる',

  // ---------- 言語切替 ----------
  /** 切り替え先の言語名を出す（日本語表示中は「EN」） */
  'lang.toggleLabel': 'EN',
  'lang.toggleTitle': '表示言語を英語に切り替える',

  // ---------- ヘッダー ----------
  'header.subtitle': '図を描くと Terraform ができる',
  'header.templates': 'テンプレート',
  'header.settings': '設定',
  'header.saveDiagram': '図を保存',
  'header.openDiagram': '図を開く',
  'header.clearAll': '全消去',
  'header.clearAllConfirm': 'キャンバスをすべて消去しますか？',

  // ---------- キャンバス（空状態） ----------
  'canvas.emptyTitle': 'まだ何も置かれていません',
  'canvas.emptyLead': '左のパレットからアイコンをドラッグするか、',
  'canvas.emptyLink': 'テンプレートから始める',
  'canvas.emptyTail': 'を選びましょう',

  // ---------- ドキュメント読み取りエラーのバナー ----------
  'docError.title': 'ファイルの内容を読み取れませんでした',
  'docError.hint':
    'キャンバスは最後に読み取れた状態のままです。ファイルを直すまで、ここでの編集はファイルへ反映されません。',
  'docError.closeTitle': '閉じる（ファイルが直るまで同期は止まったままです）',

  // ---------- パレット（Sidebar） ----------
  'sidebar.introLead': 'アイコンをキャンバスへ',
  'sidebar.introDragDrop': 'ドラッグ&ドロップ',
  'sidebar.introMiddle': 'して配置し、アイコンの端の丸から',
  'sidebar.introConnect': '矢印でつなぐ',
  'sidebar.introTail': 'と、右側にTerraformコードが生成されます。',
  'sidebar.footer': 'アイコン: AWS公式 Architecture Icons',

  // ---------- インスペクタ ----------
  'inspector.nameLabel': '名前（リソース名に使われます）',
  'inspector.namePlaceholder': '例: user-api',
  'inspector.envsLabel': '作成する環境',
  'inspector.extraHclLabel': '追加HCL（上級者向け）',
  'inspector.extraHclNote': 'このリソースのブロック末尾にそのまま挿入されます',
  'inspector.delete': '削除（Deleteキーでも可）',

  // ---------- コードパネル ----------
  'code.writeToWorkspace': 'ワークスペースへ書き出し',
  'code.writeToWorkspaceTitle': 'ワークスペースの terraform/ 配下に全環境のコードを書き出します',
  'code.zipAll': '全環境ZIP',
  'code.tabCode': 'main.tf',
  'code.tabHints': 'ヒント',
  'code.copy': 'コピー',
  'code.copied': 'コピーしました',
  'code.hintsEmptyTitle': '{env} 環境に問題は見つかりませんでした。',
  'code.hintsEmptyBody': 'このままコードをダウンロードして使えます。',
  'code.howToTitle': '使い方',
  'code.howTo1': '左のパレットからアイコンをキャンバスへドラッグ',
  'code.howTo2': 'アイコン右端の丸をドラッグして別のアイコンにつなぐ',
  'code.howTo3': 'RDSはVPCの枠の中に配置する',
  'code.howTo4': 'ノードを選択して「作成する環境」を切り替え（DEVだけ・PRDだけ等）',
  'code.howTo5': '「⬇ 全環境ZIP」で DEV / STG / PRD 一式をダウンロード',
  'code.howTo6Lead': '各環境のディレクトリで ',
  'code.howTo7Lead': '手での追記は同梱の ',
  'code.howTo7Tail': ' へ（main.tfは再生成で上書きされます）',

  // ---------- 設定モーダル ----------
  'settings.title': '設定',
  'settings.projectLabel': 'プロジェクト名（{project} に入ります）',
  'settings.projectPlaceholder': '例: myapp',
  'settings.patternLabel': '命名規則パターン（使えるトークン: {project} {env} {name}）',
  'settings.patternError': 'パターンには {name} を含めてください',
  'settings.previewLabel': 'プレビュー: ',
  'settings.previewNote': '（DEV環境・名前 user-api の場合）',
  'settings.commonTags': '全リソースに共通タグを付与（Project / Environment / ManagedBy）',
  'settings.note':
    '設定は生成されるTerraformコードの物理リソース名とタグに反映されます。図と一緒に保存されます。',

  // ---------- テンプレートギャラリー ----------
  'gallery.title': 'テンプレートから始める',
  'gallery.filterAll': 'すべて',
  'gallery.cta': 'この構成を使う →',

  // ---------- VPCグループノード ----------
  'node.vpcHint': 'この枠の中にリソースをドラッグ',

  // ---------- トースト ----------
  'toast.connected': '✓ {description}',
  'toast.rdsNeedsVpc': 'ヒント: RDSはVPCの枠の中に配置してください',
  'toast.vpcNotConnectable':
    'VPCは線でつなぐのではなく、リソースを枠の中にドラッグして配置します',
  'toast.reversedArrow': '矢印の向きが逆です。呼び出す側 → 呼び出される側 の順でつないでください',
  'toast.unsupportedConnection': 'この組み合わせの接続は現在サポートされていません',
  'toast.templateLoaded': 'テンプレート「{title}」を読み込みました',
  'toast.diagramLoaded': '図を読み込みました',
  'toast.loadFailed': '読み込みに失敗しました: {message}',
  'toast.warningOne': '警告: {message}',
  'toast.warningMany': '警告{count}件: {message} ほか',

  // ---------- ドキュメント（*.awsdiagram.json）の読み取りエラー ----------
  'doc.unknownError': '原因不明のエラー',
  'doc.jsonSyntaxInvalid': '構成図のJSON構文が不正です: {detail}',
  'doc.jsonNotObject': '構成図のJSONはオブジェクト形式で記述してください',
  'doc.jsonMissingArrays': '構成図のJSONに nodes / edges の配列が見つかりません',
} as const;

/** 辞書のキー */
export type MessageKey = keyof typeof JA;

/** 英語辞書（キーは日本語辞書と完全に一致させる） */
const EN: Record<MessageKey, string> = {
  // ---------- 共通 ----------
  'app.title': 'Zuform — Draw a diagram, get Terraform',
  'common.close': 'Close',

  // ---------- 言語切替 ----------
  'lang.toggleLabel': '日本語',
  'lang.toggleTitle': 'Switch the interface language to Japanese',

  // ---------- ヘッダー ----------
  'header.subtitle': 'Draw a diagram, get Terraform',
  'header.templates': 'Templates',
  'header.settings': 'Settings',
  'header.saveDiagram': 'Save diagram',
  'header.openDiagram': 'Open diagram',
  'header.clearAll': 'Clear all',
  'header.clearAllConfirm': 'Clear everything on the canvas?',

  // ---------- キャンバス（空状態） ----------
  'canvas.emptyTitle': 'Nothing on the canvas yet',
  'canvas.emptyLead': 'Drag an icon from the palette on the left, or ',
  'canvas.emptyLink': 'start from a template',
  'canvas.emptyTail': '.',

  // ---------- ドキュメント読み取りエラーのバナー ----------
  'docError.title': 'Could not read this file',
  'docError.hint':
    'The canvas still shows the last version that could be read. Edits made here will not reach the file until it is fixed.',
  'docError.closeTitle': 'Close (sync stays paused until the file is fixed)',

  // ---------- パレット（Sidebar） ----------
  'sidebar.introLead': '',
  'sidebar.introDragDrop': 'Drag and drop',
  'sidebar.introMiddle': ' icons onto the canvas, then ',
  'sidebar.introConnect': 'connect them with arrows',
  'sidebar.introTail': ' from the dots on their edges. Terraform code appears on the right.',
  'sidebar.footer': 'Icons: AWS Architecture Icons',

  // ---------- インスペクタ ----------
  'inspector.nameLabel': 'Name (used for resource names)',
  'inspector.namePlaceholder': 'e.g. user-api',
  'inspector.envsLabel': 'Environments to create',
  'inspector.extraHclLabel': 'Extra HCL (advanced)',
  'inspector.extraHclNote': 'Inserted verbatim at the end of this resource block',
  'inspector.delete': 'Delete (or press Delete)',

  // ---------- コードパネル ----------
  'code.writeToWorkspace': 'Write to workspace',
  'code.writeToWorkspaceTitle':
    'Writes every environment into terraform/ in the current workspace',
  'code.zipAll': 'All environments (ZIP)',
  'code.tabCode': 'main.tf',
  'code.tabHints': 'Hints',
  'code.copy': 'Copy',
  'code.copied': 'Copied',
  'code.hintsEmptyTitle': 'No issues found for the {env} environment.',
  'code.hintsEmptyBody': 'You can download the code and use it as is.',
  'code.howToTitle': 'How it works',
  'code.howTo1': 'Drag an icon from the left palette onto the canvas',
  'code.howTo2': "Drag from the dot on an icon's right edge to another icon",
  'code.howTo3': 'Place RDS inside a VPC frame',
  'code.howTo4':
    'Select a node to change the environments it is created in (DEV only, PRD only, and so on)',
  'code.howTo5': 'Use "⬇ All environments (ZIP)" to download DEV / STG / PRD together',
  'code.howTo6Lead': 'In each environment directory run ',
  'code.howTo7Lead': 'Put hand-written additions in the bundled ',
  'code.howTo7Tail': ' (main.tf is overwritten on every regeneration)',

  // ---------- 設定モーダル ----------
  'settings.title': 'Settings',
  'settings.projectLabel': 'Project name (fills {project})',
  'settings.patternLabel': 'Naming pattern (available tokens: {project} {env} {name})',
  'settings.projectPlaceholder': 'e.g. myapp',
  'settings.patternError': 'The pattern must contain {name}',
  'settings.previewLabel': 'Preview: ',
  'settings.previewNote': '(DEV environment, name "user-api")',
  'settings.commonTags': 'Tag every resource with common tags (Project / Environment / ManagedBy)',
  'settings.note':
    'These settings drive the physical resource names and tags in the generated Terraform. They are saved together with the diagram.',

  // ---------- テンプレートギャラリー ----------
  'gallery.title': 'Start from a template',
  'gallery.filterAll': 'All',
  'gallery.cta': 'Use this architecture →',

  // ---------- VPCグループノード ----------
  'node.vpcHint': 'Drag resources into this frame',

  // ---------- トースト ----------
  'toast.connected': '✓ {description}',
  'toast.rdsNeedsVpc': 'Tip: place RDS inside a VPC frame',
  'toast.vpcNotConnectable':
    'A VPC is not wired up with arrows. Drag resources inside the frame instead.',
  'toast.reversedArrow': 'The arrow points the wrong way. Connect caller → callee.',
  'toast.unsupportedConnection': 'This connection is not supported yet',
  'toast.templateLoaded': 'Loaded the "{title}" template',
  'toast.diagramLoaded': 'Diagram loaded',
  'toast.loadFailed': 'Could not open the file: {message}',
  'toast.warningOne': 'Warning: {message}',
  'toast.warningMany': '{count} warnings: {message} and more',

  // ---------- ドキュメント（*.awsdiagram.json）の読み取りエラー ----------
  'doc.unknownError': 'Unknown error',
  'doc.jsonSyntaxInvalid': 'Invalid JSON syntax in the diagram file: {detail}',
  'doc.jsonNotObject': 'The diagram JSON must be an object',
  'doc.jsonMissingArrays': 'The diagram JSON has no nodes / edges arrays',
};

/** 言語ごとの辞書 */
export const MESSAGES: Record<Lang, Record<MessageKey, string>> = { ja: JA, en: EN };

/**
 * 文言を引く。`vars` に渡したキーだけを `{name}` 形式のプレースホルダへ差し込む
 * （渡されなかったプレースホルダは、そのままの文字列として残る）。
 */
export function t(lang: Lang, key: MessageKey, vars?: TemplateVars): string {
  const raw = MESSAGES[lang][key] ?? MESSAGES.ja[key];
  if (!vars) return raw;
  let text = raw;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

// ------------------------------------------------------------
// core 由来の文字列の対訳マップ
//   core/ は変更禁止のため、日本語は core の文字列をそのまま使い、
//   英語表示のときだけここの訳へ差し替える。
// ------------------------------------------------------------

/** サービス説明（core/registry/*.ts の description の英訳） */
export const serviceDescriptions: Record<ServiceType, { en: string }> = {
  apigateway: { en: 'Entry point for HTTP requests' },
  cloudfront: { en: 'CDN for static site delivery' },
  vpc: { en: 'Private network boundary' },
  lambda: { en: 'Serverless function' },
  ec2: { en: 'Virtual server' },
  sqs: { en: 'Message queue for async work' },
  sns: { en: 'Notifications and fan-out delivery' },
  eventbridge: { en: 'Scheduled execution (batch)' },
  stepfunctions: { en: 'Multi-step workflow' },
  dynamodb: { en: 'NoSQL database' },
  rds: { en: 'Relational DB (place inside a VPC)' },
  s3: { en: 'Object storage' },
};

/**
 * カテゴリ名（core/registry/*.ts の category の英訳）。
 * このオブジェクトの並び順がパレットの表示順になる。
 */
export const categories: Record<string, { en: string }> = {
  'ネットワーク': { en: 'Networking' },
  'コンピューティング': { en: 'Compute' },
  'アプリ統合': { en: 'Application integration' },
  'データベース': { en: 'Database' },
  'ストレージ': { en: 'Storage' },
};

/** パレットのカテゴリ表示順（core のカテゴリ名がキー） */
export const CATEGORY_ORDER: string[] = Object.keys(categories);

/** テンプレートの用途カテゴリ（core/templates.ts の USE_CASES の英訳） */
export const useCases: Record<string, { en: string }> = {
  'API開発': { en: 'API development' },
  'バッチ/定期実行': { en: 'Batch / scheduled' },
  '静的サイト配信': { en: 'Static sites' },
  'ファイル保存': { en: 'File storage' },
  'Webサーバー': { en: 'Web servers' },
};

/** テンプレートの難易度（core/templates.ts の level の英訳） */
export const levels: Record<string, { en: string }> = {
  '入門': { en: 'Beginner' },
  '基本': { en: 'Core' },
};

/** 難易度バッジを「やさしい」配色にする level の値（core/templates.ts の値） */
export const LEVEL_EASY: string = '入門';

/** テンプレートのタイトル・説明（core/templates.ts の英訳。キーはテンプレートid） */
export const templates: Record<string, { title: { en: string }; description: { en: string } }> = {
  'serverless-api': {
    title: { en: 'Serverless API' },
    description: {
      en:
        'API Gateway + Lambda + DynamoDB. The smallest REST API you can ship: no servers to manage, and you only pay for what you use. Start here.',
    },
  },
  'web-db-api': {
    title: { en: 'Web API with a relational DB' },
    description: {
      en:
        'API Gateway + Lambda + RDS (MySQL). For APIs that need a relational database. RDS lives inside the VPC, and the Lambda gets its VPC config and security groups generated for it.',
    },
  },
  'file-upload': {
    title: { en: 'File upload API' },
    description: {
      en:
        'API Gateway + Lambda + S3 + DynamoDB. The standard pattern: file bodies go to S3, metadata (file name, timestamps) goes to DynamoDB.',
    },
  },
  'ec2-web': {
    title: { en: 'EC2 web server + RDS' },
    description: {
      en:
        'The classic setup: an EC2 instance and RDS inside a VPC. A good fit for long-running apps such as WordPress.',
    },
  },
  'scheduled-batch': {
    title: { en: 'Scheduled batch' },
    description: {
      en:
        'EventBridge + Lambda + DynamoDB. The minimal way to run a Lambda on a schedule. Adjust the interval through the cron expression in the generated code.',
    },
  },
  'async-worker': {
    title: { en: 'Async worker (SQS)' },
    description: {
      en:
        'API Gateway + Lambda + SQS + worker Lambda. Push slow work onto a queue and respond immediately. Failed messages land in a dead-letter queue.',
    },
  },
  'static-site': {
    title: { en: 'Static site delivery' },
    description: {
      en:
        'CloudFront + S3. Serve HTML/CSS/JS from a private S3 bucket over HTTPS through the CDN. Direct bucket access is blocked by OAC.',
    },
  },
};

/** サービス説明を表示言語に合わせて返す（ja は core の文字列をそのまま使う） */
export function serviceDescription(lang: Lang, type: ServiceType, japanese: string): string {
  return lang === 'en' ? serviceDescriptions[type]?.en ?? japanese : japanese;
}

/** カテゴリ名を表示言語に合わせて返す */
export function categoryLabel(lang: Lang, category: string): string {
  return lang === 'en' ? categories[category]?.en ?? category : category;
}

/** テンプレートの用途カテゴリを表示言語に合わせて返す */
export function useCaseLabel(lang: Lang, useCase: string): string {
  return lang === 'en' ? useCases[useCase]?.en ?? useCase : useCase;
}

/** テンプレートの難易度を表示言語に合わせて返す */
export function levelLabel(lang: Lang, level: string): string {
  return lang === 'en' ? levels[level]?.en ?? level : level;
}

/** テンプレートのタイトルを表示言語に合わせて返す */
export function templateTitle(lang: Lang, id: string, japanese: string): string {
  return lang === 'en' ? templates[id]?.title.en ?? japanese : japanese;
}

/** テンプレートの説明を表示言語に合わせて返す */
export function templateDescription(lang: Lang, id: string, japanese: string): string {
  return lang === 'en' ? templates[id]?.description.en ?? japanese : japanese;
}

// ------------------------------------------------------------
// 表示言語の判定と保存
// ------------------------------------------------------------

function isLang(value: unknown): value is Lang {
  return value === 'ja' || value === 'en';
}

/**
 * 初期表示言語を決める。
 *   1. localStorage に保存された言語
 *   2. なければ navigator.language が ja で始まるなら ja
 *   3. それ以外は en
 */
export function detectInitialLang(): Lang {
  try {
    const stored = globalThis.localStorage?.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // localStorage が使えない環境（プライベートモード等）は既定の判定へ進む
  }
  const browserLang = globalThis.navigator?.language ?? '';
  return browserLang.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** 選択した言語を保存する（保存できない環境では黙って諦める） */
export function persistLang(lang: Lang): void {
  try {
    globalThis.localStorage?.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // 保存できなくても表示自体は続けられるため無視する
  }
}

// ------------------------------------------------------------
// React へ配る（LangContext）
// ------------------------------------------------------------

export interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 現在の言語で文言を引く */
  t: (key: MessageKey, vars?: TemplateVars) => string;
}

/** Provider の外側で使われた場合は日本語で動く（テスト等の保険） */
export const LangContext: Context<LangContextValue> = createContext<LangContextValue>({
  lang: 'ja',
  setLang: () => {},
  t: (key, vars) => t('ja', key, vars),
});

/** 現在の表示言語と t() を取り出す */
export function useLang(): LangContextValue {
  return useContext(LangContext);
}
