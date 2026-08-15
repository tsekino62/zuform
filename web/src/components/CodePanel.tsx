import { useMemo, useState } from 'react';
import type { Edge } from '@xyflow/react';
import { strToU8, zipSync } from 'fflate';
import { generateAll } from '@zuform/core/generator';
import type { AwsNode, EnvId, NamingConfig } from '@zuform/core/types';
import { ENV_IDS } from '@zuform/core/types';
import { isInVsCode, postWriteFiles } from '../vscode.ts';
import { CUSTOM_TF, ENVIRONMENTS_README } from '../generatedFiles.ts';
import { useLang } from '../i18n.ts';

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
  const { t } = useLang();
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
    const files: Record<string, string> = {
      'environments/README.md': ENVIRONMENTS_README,
    };
    for (const e of ENV_IDS) {
      files[`environments/${e}/main.tf`] = results[e].code;
      files[`environments/${e}/custom.tf`] = CUSTOM_TF;
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
            title={t('code.writeToWorkspaceTitle')}
          >
            ⬇ {t('code.writeToWorkspace')}
          </button>
        ) : (
          <button type="button" className="btn btn--accent code-panel__zip" onClick={downloadZip}>
            ⬇ {t('code.zipAll')}
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
            {t('code.tabCode')}
          </button>
          <button
            type="button"
            className={`code-tab${tab === 'hints' ? ' is-active' : ''}`}
            onClick={() => setTab('hints')}
          >
            {t('code.tabHints')}
            {hints.length > 0 && <span className="code-tab__badge">{hints.length}</span>}
          </button>
        </div>
        <div className="code-panel__actions">
          <button type="button" className="btn btn--ghost" onClick={copy}>
            {copied ? `✓ ${t('code.copied')}` : t('code.copy')}
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
              {t('code.hintsEmptyTitle', { env: env.toUpperCase() })}
              <br />
              {t('code.hintsEmptyBody')}
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
            <h3>{t('code.howToTitle')}</h3>
            <ol>
              <li>{t('code.howTo1')}</li>
              <li>{t('code.howTo2')}</li>
              <li>{t('code.howTo3')}</li>
              <li>{t('code.howTo4')}</li>
              <li>{t('code.howTo5')}</li>
              <li>
                {t('code.howTo6Lead')}
                <code>terraform init</code> → <code>plan</code> → <code>apply</code>
              </li>
              <li>
                {t('code.howTo7Lead')}
                <code>custom.tf</code>
                {t('code.howTo7Tail')}
              </li>
            </ol>
          </div>
        </div>
      )}
    </aside>
  );
}
