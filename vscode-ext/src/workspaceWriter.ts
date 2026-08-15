// ============================================================
// 生成したTerraformをワークスペースへ書き出す
//
// 書き出し先は「最初のワークスペースフォルダ / terraform / <受け取った相対パス>」。
// 例: files['environments/dev/main.tf'] -> <workspace>/terraform/environments/dev/main.tf
// ============================================================

import * as vscode from 'vscode';

/** 書き出し先のルートディレクトリ名 */
const OUTPUT_DIR = 'terraform';

/**
 * 既存ファイルを上書きしないファイル名。
 * custom.tf は利用者が手で書き足すためのファイルなので、再生成で消してはいけない。
 */
const PRESERVE_FILENAMES = ['custom.tf'];

/** 相対パスとして安全か（.. や絶対パスでワークスペース外へ出るのを防ぐ） */
function isSafeRelativePath(relativePath: string): boolean {
  if (relativePath.length === 0) return false;
  if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) return false;
  const segments = relativePath.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function shouldPreserve(relativePath: string): boolean {
  const filename = relativePath.split('/').pop() ?? '';
  return PRESERVE_FILENAMES.includes(filename);
}

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

export interface WriteResult {
  written: string[];
  skipped: string[];
}

/**
 * files（相対パス -> 内容）をワークスペースへ書き出す。
 * 親ディレクトリは workspace.fs.writeFile が自動で作成する。
 */
export async function writeTerraformFiles(files: Record<string, string>): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    await vscode.window.showErrorMessage(
      'ワークスペースフォルダが開かれていないため書き出せません。フォルダを開いてから実行してください。',
    );
    return;
  }

  const root = vscode.Uri.joinPath(folder.uri, OUTPUT_DIR);
  const result: WriteResult = { written: [], skipped: [] };
  const encoder = new TextEncoder();

  try {
    for (const [relativePath, content] of Object.entries(files)) {
      if (typeof content !== 'string' || !isSafeRelativePath(relativePath)) continue;
      const target = vscode.Uri.joinPath(root, ...relativePath.split('/'));

      if (shouldPreserve(relativePath) && (await exists(target))) {
        result.skipped.push(relativePath);
        continue;
      }
      await vscode.workspace.fs.writeFile(target, encoder.encode(content));
      result.written.push(relativePath);
    }
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`Terraformの書き出しに失敗しました: ${detail}`);
    return;
  }

  const skippedNote =
    result.skipped.length > 0
      ? `（既存の custom.tf ${result.skipped.length}件はそのまま残しました）`
      : '';
  await vscode.window.showInformationMessage(
    `${OUTPUT_DIR}/ に ${result.written.length} 件のファイルを書き出しました${skippedNote}`,
  );
}
