// ============================================================
// Zuform VSCode拡張（プロトタイプ）
//
// *.awsarch.yaml（アーキテクチャ定義ファイル）と、後方互換の *.awsdiagram.json を
// カスタムエディタ（Webview）で開き、既存のキャンバスUIをそのまま埋め込む。
// 図の編集は WorkspaceEdit としてテキストドキュメントへ反映され、
// 保存は通常どおり Ctrl+S（＝VSCodeのダーティ管理・undo履歴に乗る）。
//
// この拡張ホストは YAML / JSON の中身を一切解釈しない。
// テキストをそのまま渡し、そのまま受け取って全置換するだけで、
// フォーマットの解釈・生成はすべてWebview側（archfile）が担当する。
//
// メッセージの流れ:
//   Webview ready ──▶ 拡張が init（document.getText() + 記法）を返す
//   Webview diagramChanged ──▶ 拡張が受け取ったテキストで WorkspaceEdit 全置換
//   外部からのドキュメント変更（undo/他エディタ/git）──▶ 拡張が init を再送
//   Webview writeFiles ──▶ terraform/ 配下へ書き出し
// ============================================================

import * as vscode from 'vscode';
import { detectLanguage, isToExtensionMessage } from './messages';
import type { ToWebviewMessage } from './messages';
import { buildWebviewHtml } from './webviewHtml';
import { writeTerraformFiles } from './workspaceWriter';

const VIEW_TYPE = 'zuform.diagram';
/** 新規作成時の既定の拡張子（人が読み書きするYAML形式） */
const YAML_SUFFIX = '.awsarch.yaml';

/** 新規作成時に書き出す最小のアーキテクチャ定義（このあとキャンバスが上書きする） */
const EMPTY_YAML_TEMPLATE = ['version: 1', 'project: myapp', '', 'resources: {}', ''].join('\n');

/** 旧形式（*.awsdiagram.json）で新規作成した場合のテンプレート */
const EMPTY_JSON_TEMPLATE = `${
  JSON.stringify(
    {
      version: 2,
      nodes: [],
      edges: [],
      naming: { project: 'myapp', pattern: '{project}-{env}-{name}', commonTags: true },
    },
    null,
    2,
  )
}\n`;

class ZuformEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new ZuformEditorProvider(context),
      {
        // タブを切り替えてもReact Flowの状態（ズーム位置など）を保つ
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    );
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const { webview } = webviewPanel;
    webview.options = {
      enableScripts: true,
      // media/（Viteビルド成果物）配下だけを読み込み可能にする
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    webview.html = await buildWebviewHtml(webview, this.context.extensionUri);

    const language = detectLanguage(document.uri.path);

    // Webviewと同期済みのテキスト。
    // 「拡張が自分で書いた変更」で init を送り返さないためのガードに使う。
    // （init 再送はキャンバスの再構築を伴うため、編集中に起きると操作感を損なう）
    let syncedText = '';

    const sendInit = (): void => {
      const text = document.getText();
      syncedText = text;
      const message: ToWebviewMessage = { type: 'init', text, language };
      void webview.postMessage(message);
    };

    /** Webviewからの編集（直列化済みテキスト）をドキュメントへ全置換で反映する */
    const applyDiagram = async (newText: string): Promise<void> => {
      if (newText === document.getText()) return; // 実質変化なし。ダーティにしない
      syncedText = newText;
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(0, 0, document.lineCount, 0),
        newText,
      );
      const ok = await vscode.workspace.applyEdit(edit);
      if (!ok) {
        await vscode.window.showErrorMessage('構成図の変更をファイルへ反映できませんでした。');
      }
    };

    // 外部要因（undo/redo、別エディタでの編集、gitのチェックアウト等）で
    // ドキュメントが変わったらキャンバスへ流し込む。
    // 自分（applyDiagram）が書いた内容は syncedText と一致するので無視する。
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() !== document.uri.toString()) return;
      if (event.contentChanges.length === 0) return;
      if (event.document.getText() === syncedText) return;
      sendInit();
    });

    const messageSubscription = webview.onDidReceiveMessage((raw: unknown) => {
      if (!isToExtensionMessage(raw)) return;
      switch (raw.type) {
        case 'ready':
          // Webview側のリスナー登録が完了してから初期データを渡す
          sendInit();
          return;
        case 'diagramChanged':
          void applyDiagram(raw.text);
          return;
        case 'writeFiles':
          void writeTerraformFiles(raw.files);
          return;
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose();
      messageSubscription.dispose();
    });
  }
}

/** 「Zuform: 新しい構成図を作成」 */
async function createNewDiagram(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const defaultUri = folder
    ? vscode.Uri.joinPath(folder.uri, `diagram${YAML_SUFFIX}`)
    : undefined;

  // 注意: filtersに多段拡張子（'awsarch.yaml'）を渡すと、OSのダイアログが
  // ファイル名末尾へ拡張子を再付与して「diagram.awsarch.yaml.awsarch.yaml」の
  // ような二重拡張子を作ることがある。単段の 'yaml' を渡し、既定名側で
  // .awsarch.yaml を担保する。
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    saveLabel: '作成',
    filters: { 'Zuform 構成図 (YAML)': ['yaml'] },
  });
  if (!target) return;

  // 保存ダイアログで .awsdiagram.json を選んだ場合だけ旧形式のテンプレートにする
  const template = detectLanguage(target.path) === 'yaml' ? EMPTY_YAML_TEMPLATE : EMPTY_JSON_TEMPLATE;

  try {
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(template));
    // 拡張子が *.awsarch.yaml でなくても、このカスタムエディタで開く
    await vscode.commands.executeCommand('vscode.openWith', target, VIEW_TYPE);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`構成図を作成できませんでした: ${detail}`);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    ZuformEditorProvider.register(context),
    vscode.commands.registerCommand('zuform.newDiagram', createNewDiagram),
  );
}

export function deactivate(): void {
  // 後始末は context.subscriptions に任せる
}
