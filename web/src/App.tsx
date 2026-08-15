import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from '@xyflow/react';
import type {
  Connection,
  Edge,
  OnConnectEnd,
  OnNodeDrag,
  IsValidConnection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CONNECTION_RULES, connectionKey, MODULES } from '@zuform/core/registry';
import type { AwsNode, AwsNodeData, EnvId, NamingConfig, ServiceType } from '@zuform/core/types';
import { DEFAULT_NAMING } from '@zuform/core/types';
import { Sidebar } from './components/Sidebar.tsx';
import { AwsServiceNode } from './components/AwsServiceNode.tsx';
import { VpcGroupNode } from './components/VpcGroupNode.tsx';
import { CodePanel } from './components/CodePanel.tsx';
import { InspectorPanel } from './components/InspectorPanel.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { TemplateGallery } from './components/TemplateGallery.tsx';
import type { DiagramTemplate } from '@zuform/core/templates';
import {
  isInVsCode,
  onInit,
  parseDiagramText,
  postDiagramChanged,
  postReady,
  serializeDiagramText,
} from './vscode.ts';
import type { DocumentLanguage, ParsedDiagram } from './vscode.ts';
import {
  detectInitialLang,
  LangContext,
  persistLang,
  t as translate,
  templateTitle,
  useLang,
} from './i18n.ts';
import type { Lang, LangContextValue, MessageKey, TemplateVars } from './i18n.ts';
import './App.css';

/** VSCodeのWebview内で動いているか（起動時に一度だけ判定する） */
const IN_VSCODE = isInVsCode();

const nodeTypes = { aws: AwsServiceNode, vpc: VpcGroupNode };

const STORAGE_KEY = 'aws-builder-diagram-v2';
const LEGACY_STORAGE_KEY = 'aws-builder-diagram-v1';

const defaultEdgeOptions = {
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#5b6472' },
  style: { strokeWidth: 1.8, stroke: '#5b6472' },
};

let idSeq = 0;
function newId(type: string): string {
  idSeq += 1;
  return `${type}-${Date.now().toString(36)}-${idSeq}`;
}

/** 親（VPC）ノードが子より先に来るように並べ替える（React Flowの要件） */
function sortParentsFirst(nodes: AwsNode[]): AwsNode[] {
  return [...nodes].sort((a, b) => {
    const av = a.type === 'vpc' ? 0 : 1;
    const bv = b.type === 'vpc' ? 0 : 1;
    return av - bv;
  });
}

interface SavedState {
  nodes: AwsNode[];
  edges: Edge[];
  naming: NamingConfig;
}

/**
 * ファイル名（判別できないときは中身）からドキュメントの記法を判定する。
 * `.yaml` / `.yml` は archfile（宣言形式）、`.json` は旧形式として読む。
 */
function detectLanguage(fileName: string, text: string): DocumentLanguage {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  if (lower.endsWith('.json')) return 'json';
  return text.trimStart().startsWith('{') ? 'json' : 'yaml';
}

/** 現在の言語で文言を引く関数（LangContext から受け取る t の型） */
type Translate = (key: MessageKey, vars?: TemplateVars) => string;

/**
 * 例外から利用者に見せるメッセージを取り出す。
 * core（ArchParseError）由来の本文は日本語のまま、そのまま見せる。
 */
function documentErrorMessage(error: unknown, t: Translate): string {
  return error instanceof Error && error.message !== '' ? error.message : t('doc.unknownError');
}

/** 警告一覧をトースト1行にまとめる（全文はキャンバスに出さず件数＋先頭だけ見せる） */
function warningSummary(warnings: string[], t: Translate): string {
  return warnings.length === 1
    ? t('toast.warningOne', { message: warnings[0] })
    : t('toast.warningMany', { count: warnings.length, message: warnings[0] });
}

function loadSaved(): SavedState | null {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return {
      nodes: sortParentsFirst(parsed.nodes),
      edges: parsed.edges,
      naming: { ...DEFAULT_NAMING, ...(parsed.naming ?? {}) },
    };
  } catch {
    return null;
  }
}

// VSCode内では .awsdiagram.json ドキュメントが唯一の正なので、localStorageは読まない
const saved = IN_VSCODE ? null : loadSaved();

function nodeSize(node: AwsNode): { w: number; h: number } {
  const w =
    node.measured?.width ??
    (typeof node.style?.width === 'number' ? node.style.width : undefined) ??
    (node.type === 'vpc' ? 560 : 100);
  const h =
    node.measured?.height ??
    (typeof node.style?.height === 'number' ? node.style.height : undefined) ??
    (node.type === 'vpc' ? 340 : 84);
  return { w, h };
}

function FlowEditor() {
  const { lang, setLang, t } = useLang();
  const [nodes, setNodes, onNodesChange] = useNodesState<AwsNode>(saved?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(saved?.edges ?? []);
  const [naming, setNaming] = useState<NamingConfig>(saved?.naming ?? DEFAULT_NAMING);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  /** ドキュメントを読み取れなかったときのエラー文言（キャンバス上部のバナーに出す） */
  const [docError, setDocError] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { screenToFlowPosition, getInternalNode, fitView } = useReactFlow<AwsNode, Edge>();

  /**
   * Web版（ブラウザ単体）で直前に「図を開く」/「図を保存」したYAML(archfile)の
   * 生テキスト。保存時にこれをpreviousTextとして渡すことで、コメントを保持する。
   * 新規作成時（一度も開いていない）はundefinedのまま = 従来どおりの新規生成。
   */
  const openedYamlTextRef = useRef<string | undefined>(undefined);

  /** 拡張からの init を反映している最中か（反映直後の変更通知を1回だけ抑止する） */
  const skipNextChangeRef = useRef(false);
  /** 拡張から init を受け取り済みか（受け取る前に空の図を送り返さないためのガード） */
  const initializedRef = useRef(false);
  /** ドキュメントの記法（拡張が init で教えてくる。ブラウザ単体では使わない） */
  const languageRef = useRef<DocumentLanguage>('yaml');
  /**
   * ドキュメントを読み取れていない状態か。
   * true の間はキャンバスからドキュメントへの同期を止める（後述の最重要仕様）。
   */
  const parseErrorRef = useRef(false);

  /**
   * init ハンドラの中から最新の言語を参照するための箱。
   * 言語切替のたびに拡張への購読を張り直す（= ドキュメントを読み直す）のを避ける。
   */
  const langRef = useRef({ lang, t });
  useEffect(() => {
    langRef.current = { lang, t };
  }, [lang, t]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    globalThis.clearTimeout(toastTimer.current);
    toastTimer.current = globalThis.setTimeout(() => setToast(null), 3200);
  }, []);

  // 自動保存（VSCode内ではドキュメント側に保存されるためlocalStorageは使わない）
  useEffect(() => {
    if (IN_VSCODE) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, edges, naming }));
  }, [nodes, edges, naming]);

  // VSCode: 拡張からの init（ドキュメントの生テキスト）を受け取ってキャンバスへ反映する
  useEffect(() => {
    if (!IN_VSCODE) return;
    const dispose = onInit((text, language) => {
      languageRef.current = language;
      const { lang: uiLang, t: translateNow } = langRef.current;

      let parsed: ParsedDiagram;
      try {
        parsed = parseDiagramText(text, language, uiLang);
      } catch (error) {
        // ★重要: パースに失敗してもキャンバスは最後の正常な状態のまま維持し、
        // ドキュメントへの同期も止める。ユーザーがテキストエディタでYAMLを
        // 直している最中に、キャンバス側の内容で上書きして壊さないため。
        parseErrorRef.current = true;
        setDocError(documentErrorMessage(error, translateNow));
        return;
      }

      // 読めたのでバナーを消して同期を再開する
      parseErrorRef.current = false;
      setDocError(null);

      const isFirstInit = !initializedRef.current;
      skipNextChangeRef.current = true;
      initializedRef.current = true;
      setNodes(sortParentsFirst(parsed.nodes));
      setEdges(parsed.edges.map((edge) => ({ ...defaultEdgeOptions, ...edge })));
      setNaming({ ...DEFAULT_NAMING, ...parsed.naming });
      if (parsed.warnings.length > 0) showToast(warningSummary(parsed.warnings, translateNow));
      // 初回だけ全体が見えるように寄せる（undo等の再initでは視点を動かさない）
      if (isFirstInit && parsed.nodes.length > 0) {
        setTimeout(() => fitView({ maxZoom: 1, padding: 0.15 }), 50);
      }
    });
    // 準備完了を伝えると拡張が init を送ってくる
    postReady();
    return dispose;
  }, [setNodes, setEdges, fitView, showToast]);

  // VSCode: 編集内容をドキュメントへ反映する（拡張側でWorkspaceEditに変換される）
  useEffect(() => {
    if (!IN_VSCODE) return;
    if (!initializedRef.current) return;
    // 読み取れていないドキュメントは上書きしない（次に読めたときに同期が戻る）
    if (parseErrorRef.current) return;
    if (skipNextChangeRef.current) {
      // init を反映した直後の発火。送り返すとドキュメントが無変更で汚れるため無視する
      skipNextChangeRef.current = false;
      return;
    }
    postDiagramChanged({ nodes, edges, naming }, languageRef.current);
  }, [nodes, edges, naming]);

  /** 指定座標（フロー座標）を含むVPCノードを探す */
  const findVpcAt = useCallback(
    (x: number, y: number): AwsNode | undefined => {
      return nodes.find((n) => {
        if (n.type !== 'vpc') return false;
        const { w, h } = nodeSize(n);
        return (
          x >= n.position.x && x <= n.position.x + w && y >= n.position.y && y <= n.position.y + h
        );
      });
    },
    [nodes],
  );

  // ---------- パレットからのドロップ ----------
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/zuform') as ServiceType;
      const def = MODULES[type];
      if (!def) return;

      const pos = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const count = nodes.filter((n) => n.data.serviceType === type).length + 1;

      if (def.isGroup) {
        const vpc: AwsNode = {
          id: newId('vpc'),
          type: 'vpc',
          position: { x: pos.x - 280, y: pos.y - 170 },
          style: { width: 560, height: 340 },
          data: { serviceType: 'vpc', label: count > 1 ? `vpc-${count}` : 'my-vpc' },
        };
        setNodes((nds) => sortParentsFirst([...nds, vpc]));
        return;
      }

      const center = { x: pos.x - 50, y: pos.y - 42 };
      const vpc = findVpcAt(pos.x, pos.y);
      const node: AwsNode = {
        id: newId(type),
        type: 'aws',
        position: vpc
          ? { x: center.x - vpc.position.x, y: center.y - vpc.position.y }
          : center,
        ...(vpc ? { parentId: vpc.id } : {}),
        data: {
          serviceType: type,
          label: `${def.displayName.toLowerCase().replace(/\s+/g, '-')}-${count}`,
        },
      };
      setNodes((nds) => sortParentsFirst([...nds, node]));

      if (type === 'rds' && !vpc) {
        showToast(t('toast.rdsNeedsVpc'));
      }
    },
    [screenToFlowPosition, nodes, setNodes, findVpcAt, showToast, t],
  );

  // ---------- 既存ノードのドラッグでVPCに出し入れ ----------
  const onNodeDragStop: OnNodeDrag<AwsNode> = useCallback(
    (_event, node) => {
      if (node.type === 'vpc') return;
      const internal = getInternalNode(node.id);
      if (!internal) return;
      const abs = internal.internals.positionAbsolute;
      const { w, h } = nodeSize(node);
      const cx = abs.x + w / 2;
      const cy = abs.y + h / 2;
      const vpc = findVpcAt(cx, cy);
      const currentParent = node.parentId;

      if (vpc?.id === currentParent) return;

      setNodes((nds) =>
        sortParentsFirst(
          nds.map((n) => {
            if (n.id !== node.id) return n;
            if (vpc) {
              return {
                ...n,
                parentId: vpc.id,
                position: { x: abs.x - vpc.position.x, y: abs.y - vpc.position.y },
              };
            }
            const { parentId: _removed, ...rest } = n;
            return { ...rest, position: abs };
          }),
        ),
      );
    },
    [getInternalNode, findVpcAt, setNodes],
  );

  // ---------- 接続 ----------
  const isValidConnection: IsValidConnection<Edge> = useCallback(
    (conn: Connection | Edge) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return false;
      const src = nodes.find((n) => n.id === conn.source);
      const dst = nodes.find((n) => n.id === conn.target);
      if (!src || !dst) return false;
      return !!CONNECTION_RULES[connectionKey(src.data.serviceType, dst.data.serviceType)];
    },
    [nodes],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      setEdges((eds) => addEdge({ ...conn, ...defaultEdgeOptions }, eds));
      const src = nodes.find((n) => n.id === conn.source);
      const dst = nodes.find((n) => n.id === conn.target);
      if (src && dst) {
        // 接続の意味そのものは core の文字列（現状は日本語）をそのまま見せる
        const description =
          CONNECTION_RULES[connectionKey(src.data.serviceType, dst.data.serviceType)];
        if (description) showToast(t('toast.connected', { description }));
      }
    },
    [setEdges, nodes, showToast, t],
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (_event, state) => {
      if (state.isValid !== false) return;
      const from = state.fromNode;
      const to = state.toNode;
      if (!from || !to || from.id === to.id) return;
      const s = (from.data as AwsNodeData).serviceType;
      const target = (to.data as AwsNodeData).serviceType;
      if (s === 'vpc' || target === 'vpc') {
        showToast(t('toast.vpcNotConnectable'));
      } else if (CONNECTION_RULES[connectionKey(target, s)]) {
        showToast(t('toast.reversedArrow'));
      } else {
        showToast(t('toast.unsupportedConnection'));
      }
    },
    [showToast, t],
  );

  // ---------- 選択・編集 ----------
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const renameNode = useCallback(
    (id: string, label: string) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)));
    },
    [setNodes],
  );

  const changeNodeEnvs = useCallback(
    (id: string, envs: EnvId[] | undefined) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, envs } } : n)),
      );
    },
    [setNodes],
  );

  const changeNodeExtraHcl = useCallback(
    (id: string, extraHcl: string | undefined) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, extraHcl } } : n)),
      );
    },
    [setNodes],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => {
        const removingVpc = nds.find((n) => n.id === id)?.type === 'vpc';
        return nds
          .filter((n) => n.id !== id)
          .map((n) => {
            if (removingVpc && n.parentId === id) {
              const { parentId: _removed, ...rest } = n;
              const vpc = nds.find((v) => v.id === id);
              return {
                ...rest,
                position: vpc
                  ? { x: n.position.x + vpc.position.x, y: n.position.y + vpc.position.y }
                  : n.position,
              };
            }
            return n;
          });
      });
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedId(null);
    },
    [setNodes, setEdges],
  );

  // ---------- テンプレート / ヘッダー操作 ----------
  const loadTemplate = useCallback(
    (template: DiagramTemplate) => {
      setNodes(sortParentsFirst(template.nodes.map((n) => structuredClone(n))));
      setEdges(template.edges.map((e) => ({ ...defaultEdgeOptions, ...e })));
      setShowGallery(false);
      showToast(
        t('toast.templateLoaded', { title: templateTitle(lang, template.id, template.title) }),
      );
      setTimeout(() => fitView({ maxZoom: 1, padding: 0.15 }), 50);
    },
    [setNodes, setEdges, showToast, fitView, lang, t],
  );

  const clearAll = useCallback(() => {
    if (nodes.length === 0) return;
    if (globalThis.confirm(t('header.clearAllConfirm'))) {
      setNodes([]);
      setEdges([]);
      setSelectedId(null);
    }
  }, [nodes.length, setNodes, setEdges, t]);

  /** 図をアーキテクチャ定義ファイル（*.awsarch.yaml）として書き出す */
  const saveDiagram = useCallback(() => {
    const text = serializeDiagramText({ nodes, edges, naming }, 'yaml', openedYamlTextRef.current);
    // 保存したテキストを次回保存時のpreviousTextにする（コメントを保ち続けられるように）
    openedYamlTextRef.current = text;
    const blob = new Blob([text], { type: 'application/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagram.awsarch.yaml';
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, naming]);

  /** *.awsarch.yaml（新形式）と *.awsdiagram.json（旧形式）の両方を開く */
  const loadDiagram = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result);
        const language = detectLanguage(file.name, text);
        try {
          const parsed = parseDiagramText(text, language, lang);
          setNodes(sortParentsFirst(parsed.nodes));
          setEdges(parsed.edges.map((edge) => ({ ...defaultEdgeOptions, ...edge })));
          setNaming({ ...DEFAULT_NAMING, ...parsed.naming });
          // 開いた元テキストを保持する（YAMLのみ。次回保存時にコメント保持のpreviousTextとして使う）
          openedYamlTextRef.current = language === 'yaml' ? text : undefined;
          showToast(
            parsed.warnings.length > 0
              ? warningSummary(parsed.warnings, t)
              : t('toast.diagramLoaded'),
          );
          setTimeout(() => fitView({ maxZoom: 1, padding: 0.15 }), 50);
        } catch (error) {
          showToast(t('toast.loadFailed', { message: documentErrorMessage(error, t) }));
        }
      };
      reader.readAsText(file);
      event.target.value = '';
    },
    [setNodes, setEdges, showToast, fitView, lang, t],
  );

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span className="header__mark">▦</span>
          <h1>
            Zuform
            <span className="header__sub">{t('header.subtitle')}</span>
          </h1>
        </div>
        <div className="header__actions">
          <button
            type="button"
            className="btn btn--ghost-light"
            onClick={() => setLang(lang === 'ja' ? 'en' : 'ja')}
            title={t('lang.toggleTitle')}
            lang={lang === 'ja' ? 'en' : 'ja'}
          >
            {t('lang.toggleLabel')}
          </button>
          <button type="button" className="btn btn--ghost-light" onClick={() => setShowGallery(true)}>
            {t('header.templates')}
          </button>
          <button type="button" className="btn btn--ghost-light" onClick={() => setShowSettings(true)}>
            {t('header.settings')}
          </button>
          {/* VSCode内ではファイルの保存/オープンはエディタ側（Ctrl+S・エクスプローラ）に一本化する */}
          {!IN_VSCODE && (
            <>
              <button type="button" className="btn btn--ghost-light" onClick={saveDiagram}>
                {t('header.saveDiagram')}
              </button>
              <button
                type="button"
                className="btn btn--ghost-light"
                onClick={() => fileInputRef.current?.click()}
              >
                {t('header.openDiagram')}
              </button>
            </>
          )}
          <button type="button" className="btn btn--ghost-light btn--danger-text" onClick={clearAll}>
            {t('header.clearAll')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".yaml,.yml,.json"
            hidden
            onChange={loadDiagram}
          />
        </div>
      </header>

      <div className="main">
        <Sidebar />

        <div className="canvas">
          {docError && (
            <div className="doc-error" role="alert">
              <div className="doc-error__body">
                <p className="doc-error__title">{t('docError.title')}</p>
                {/* エラー本文は core（ArchParseError）が組み立てた文字列をそのまま出す */}
                <p className="doc-error__message">{docError}</p>
                <p className="doc-error__hint">{t('docError.hint')}</p>
              </div>
              <button
                type="button"
                className="doc-error__close"
                onClick={() => setDocError(null)}
                aria-label={t('common.close')}
                title={t('docError.closeTitle')}
              >
                ×
              </button>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectEnd={onConnectEnd}
            isValidConnection={isValidConnection}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStop={onNodeDragStop}
            onSelectionChange={({ nodes: sel }) =>
              setSelectedId(sel.length === 1 ? sel[0].id : null)
            }
            defaultEdgeOptions={defaultEdgeOptions}
            deleteKeyCode={['Backspace', 'Delete']}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            snapToGrid
            snapGrid={[10, 10]}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="#d9d4ca" />
            <Controls position="bottom-left" showInteractive={false} />
            <MiniMap
              position="bottom-right"
              pannable
              nodeColor={(n) => (n.type === 'vpc' ? '#e6dcff' : '#ffd9a0')}
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="canvas__empty">
              <p className="canvas__empty-title">{t('canvas.emptyTitle')}</p>
              <p>
                {t('canvas.emptyLead')}
                <button type="button" className="link-button" onClick={() => setShowGallery(true)}>
                  {t('canvas.emptyLink')}
                </button>
                {t('canvas.emptyTail')}
              </p>
            </div>
          )}

          {selectedNode && (
            <InspectorPanel
              node={selectedNode}
              onRename={renameNode}
              onChangeEnvs={changeNodeEnvs}
              onChangeExtraHcl={changeNodeExtraHcl}
              onDelete={deleteNode}
            />
          )}

          {toast && <div className="toast">{toast}</div>}
        </div>

        <CodePanel nodes={nodes} edges={edges} naming={naming} />
      </div>

      {showSettings && (
        <SettingsModal naming={naming} onChange={setNaming} onClose={() => setShowSettings(false)} />
      )}
      {showGallery && (
        <TemplateGallery onSelect={loadTemplate} onClose={() => setShowGallery(false)} />
      )}
    </div>
  );
}

export default function App() {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  /** 言語を切り替えて localStorage に残す（次回起動時もこの言語で開く） */
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    persistLang(next);
  }, []);

  // lang が変わるたびに新しい t を作り、配下のUIをまとめて再描画させる
  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang, setLang],
  );

  // タイトルと html の lang 属性も表示言語に追従させる
  useEffect(() => {
    document.title = translate(lang, 'app.title');
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={value}>
      <ReactFlowProvider>
        <FlowEditor />
      </ReactFlowProvider>
    </LangContext.Provider>
  );
}
