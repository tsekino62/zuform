import { useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { strToU8, zipSync } from 'fflate';
import { generateAll } from '../aws/generator.ts';
import type { AwsNode, EnvId, NamingConfig } from '../aws/types.ts';
import { ENV_IDS } from '../aws/types.ts';
import { isInVsCode, postWriteFiles } from '../vscode.ts';

/** VSCodeのWebview内で動いているか（起動時に一度だけ判定する） */
const IN_VSCODE = isInVsCode();

interface Props {
  nodes: AwsNode[];
  edges: Edge[];
  naming: NamingConfig;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 簡易HCLハイライト（コメント / 文字列 / ブロックキーワード） */
function highlightHcl(code: string): string {
  return escapeHtml(code)
    .split('\n')
    .map((line) => {
      const commentIdx = line.indexOf('#');
      let body = line;
      let comment = '';
      if (commentIdx >= 0) {
        body = line.slice(0, commentIdx);
        comment = `<span class="tok-comment">${line.slice(commentIdx)}</span>`;
      }
      body = body
        .replace(/&quot;.*?&quot;/g, (m) => `<span class="tok-string">${m}</span>`)
        .replace(
          /^(\s*)(resource|data|variable|output|provider|terraform|module|locals)(\s)/,
          '$1<span class="tok-keyword">$2</span>$3',
        );
      return body + comment;
    })
    .join('\n');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CodePanel({ nodes, edges, naming }: Props) {
  const [env, setEnv] = useState<EnvId>('dev');
  const [tab, setTab] = useState<'code' | 'hints'>('code');
  const [copied, setCopied] = useState(false);

  const results = useMemo(() => generateAll(nodes, edges, naming), [nodes, edges, naming]);
  const { code, hints } = results[env];
  const html = useMemo(() => highlightHcl(code), [code]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // クリップボードが使えない環境では何もしない
    }
  };

  const downloadCurrent = () => {
    downloadBlob(new Blob([code], { type: 'text/plain;charset=utf-8' }), `${env}.main.tf`);
  };

  /**
   * 書き出すファイル一式を組み立てる（キーは出力先の相対パス）。
   * ブラウザではZIPに、VSCodeではワークスペースの terraform/ 配下に展開される。
   */
  const buildFiles = (): Record<string, string> => {
    const customTf = [
      '# ============================================================',
      '# custom.tf — 自分の追記用ファイル（Zuformは上書きしません）',
      '#',
      '# Terraformは同じディレクトリの .tf ファイルをすべて読み込んで',
      '# 結合するため、main.tf に手を入れずにここへ追加できます。',
      '# 図を更新して main.tf を再生成しても、このファイルは無傷です。',
      '#',
      '# 生成済みリソースの「属性だけ」変えたい場合は override が便利:',
      '#   main_override.tf というファイルを作り、同名のresourceブロックで',
      '#   変えたい属性だけを書くと、その属性だけが上書きされます。',
      '#   例: RDSのサイズだけ変更する',
      '#     resource "aws_db_instance" "users_db" {',
      '#       instance_class = "db.r6g.large"',
      '#     }',
      '# ============================================================',
      '',
    ].join('\n');
    const files: Record<string, string> = {
      'environments/README.md': [
        '# 環境別Terraform',
        '',
        'Zuform で生成された環境別のコードです。',
        '',
        '```',
        'environments/',
        ...ENV_IDS.map((e) => `├── ${e}/  (main.tf + custom.tf)`),
        '```',
        '',
        '各環境のディレクトリに移動して terraform init / plan / apply を実行してください。',
        '環境ごとにtfstateが分かれるため、DEVでの試行錯誤が本番に影響しません。',
        '',
        '## 手で編集したい場合',
        '',
        '- `main.tf` はツールが再生成するファイルです。直接編集は避けてください',
        '- 追加のリソースや設定は各環境の `custom.tf` に書いてください（再生成の影響を受けません）',
        '- 生成済みリソースの属性変更は `main_override.tf`（override機能）が使えます',
      ].join('\n'),
    };
    for (const e of ENV_IDS) {
      files[`environments/${e}/main.tf`] = results[e].code;
      files[`environments/${e}/custom.tf`] = customTf;
    }
    return files;
  };

  const downloadZip = () => {
    const zipInput: Record<string, Uint8Array> = {};
    for (const [path, content] of Object.entries(buildFiles())) {
      zipInput[path] = strToU8(content);
    }
    const zipped = zipSync(zipInput);
    const copy = new Uint8Array(zipped.length);
    copy.set(zipped);
    downloadBlob(new Blob([copy.buffer], { type: 'application/zip' }), 'terraform-environments.zip');
  };

  /** VSCode: 同じ内容をワークスペースの terraform/ 配下へ直接書き出す */
  const writeToWorkspace = () => {
    postWriteFiles(buildFiles());
  };

  return (
    <aside className="code-panel">
      <div className="code-panel__envs">
        {ENV_IDS.map((e) => (
          <button
            type="button"
            key={e}
            className={`env-tab env-tab--${e}${env === e ? ' is-active' : ''}`}
            onClick={() => setEnv(e)}
          >
            {e.toUpperCase()}
            {results[e].hints.length > 0 && <span className="env-tab__dot" />}
          </button>
        ))}
        {IN_VSCODE ? (
          <button
            type="button"
            className="btn btn--accent code-panel__zip"
            onClick={writeToWorkspace}
            title="ワークスペースの terraform/ 配下に全環境のコードを書き出します"
          >
            ⬇ ワークスペースへ書き出し
          </button>
        ) : (
          <button type="button" className="btn btn--accent code-panel__zip" onClick={downloadZip}>
            ⬇ 全環境ZIP
          </button>
        )}
      </div>

      <div className="code-panel__bar">
        <div className="code-panel__tabs">
          <button
            type="button"
            className={`code-tab${tab === 'code' ? ' is-active' : ''}`}
            onClick={() => setTab('code')}
          >
            main.tf
          </button>
          <button
            type="button"
            className={`code-tab${tab === 'hints' ? ' is-active' : ''}`}
            onClick={() => setTab('hints')}
          >
            ヒント
            {hints.length > 0 && <span className="code-tab__badge">{hints.length}</span>}
          </button>
        </div>
        <div className="code-panel__actions">
          <button type="button" className="btn btn--ghost" onClick={copy}>
            {copied ? '✓ コピーしました' : 'コピー'}
          </button>
          <button type="button" className="btn btn--ghost" onClick={downloadCurrent}>
            ⬇ {env}.main.tf
          </button>
        </div>
      </div>

      {tab === 'code' ? (
        <pre className="code-panel__code">
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      ) : (
        <div className="code-panel__hints">
          {hints.length === 0 ? (
            <p className="hint-empty">
              {env.toUpperCase()} 環境に問題は見つかりませんでした。
              <br />
              このままコードをダウンロードして使えます。
            </p>
          ) : (
            hints.map((h, i) => (
              <div key={i} className="hint-item">
                <span className="hint-item__icon">💡</span>
                <p>{h}</p>
              </div>
            ))
          )}
          <div className="hint-static">
            <h3>使い方</h3>
            <ol>
              <li>左のパレットからアイコンをキャンバスへドラッグ</li>
              <li>アイコン右端の丸をドラッグして別のアイコンにつなぐ</li>
              <li>RDSはVPCの枠の中に配置する</li>
              <li>ノードを選択して「作成する環境」を切り替え（DEVだけ・PRDだけ等）</li>
              <li>「⬇ 全環境ZIP」で DEV / STG / PRD 一式をダウンロード</li>
              <li>
                各環境のディレクトリで <code>terraform init</code> → <code>plan</code> →{' '}
                <code>apply</code>
              </li>
              <li>
                手での追記は同梱の <code>custom.tf</code> へ（main.tfは再生成で上書きされます）
              </li>
            </ol>
          </div>
        </div>
      )}
    </aside>
  );
}
