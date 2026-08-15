import dagre from '@dagrejs/dagre';
import {
  Document,
  isMap,
  isScalar,
  isSeq,
  parse as parseYaml,
  parseDocument,
  Scalar,
  YAMLMap,
  YAMLParseError,
  YAMLSeq,
} from 'yaml';
import type { Edge } from '@xyflow/react';
import type { AwsNode, AwsNodeData, EnvId, NamingConfig, ServiceType } from './types.ts';
import { DEFAULT_NAMING, ENV_IDS } from './types.ts';
import { CONNECTION_RULES, connectionKey } from './registry/index.ts';

/** サポートするサービス種別（types.ts の ServiceType と同期させること） */
const VALID_SERVICE_TYPES: ReadonlySet<string> = new Set<ServiceType>([
  'apigateway',
  'lambda',
  'ec2',
  'rds',
  'dynamodb',
  's3',
  'sqs',
  'sns',
  'eventbridge',
  'stepfunctions',
  'cloudfront',
  'vpc',
]);

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'version',
  'project',
  'naming',
  'resources',
  'connections',
  'layout',
]);

const KNOWN_RESOURCE_KEYS = new Set(['type', 'in', 'envs', 'extra_hcl']);

/** ダミーノードサイズ（自動レイアウトの計算・vpcバウンディングボックス算出に使用） */
const AUTO_NODE_WIDTH = 100;
const AUTO_NODE_HEIGHT = 90;
const DEFAULT_VPC_WIDTH = 560;
const DEFAULT_VPC_HEIGHT = 340;

export interface ArchParseResult {
  /** position確定済み（layout指定 or 自動レイアウト） */
  nodes: AwsNode[];
  edges: Edge[];
  naming: NamingConfig;
  /** 軽微な問題（未知のキー等）。日本語 */
  warnings: string[];
}

/** archfile(YAML)のパース・変換に関する致命的なエラー */
export class ArchParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchParseError';
  }
}

interface ParsedResource {
  label: string;
  type: ServiceType;
  in?: string;
  envs?: EnvId[];
  extraHcl?: string;
}

interface ParsedConnection {
  from: string;
  to: string;
}

interface Point {
  x: number;
  y: number;
}

interface VpcBox extends Point {
  width: number;
  height: number;
}

/** YAMLテキスト → 内部モデル。致命的な問題は ArchParseError を投げる */
export function parseArchYaml(text: string): ArchParseResult {
  if (text.trim() === '') {
    return { nodes: [], edges: [], naming: DEFAULT_NAMING, warnings: [] };
  }

  const warnings: string[] = [];

  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (error) {
    const message = error instanceof YAMLParseError || error instanceof Error
      ? error.message
      : String(error);
    throw new ArchParseError(`archfileのYAML構文が不正です: ${message}`);
  }

  if (doc === null || doc === undefined) {
    return { nodes: [], edges: [], naming: DEFAULT_NAMING, warnings: [] };
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new ArchParseError('archfileのトップレベルはマップ形式で記述してください');
  }
  const root = doc as Record<string, unknown>;

  for (const key of Object.keys(root)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      warnings.push(`未知のトップレベルキー「${key}」は無視されました`);
    }
  }

  const naming = parseNaming(root, warnings);
  const parsedResources = parseResources(root, warnings);
  const byLabel = new Map(parsedResources.map((r) => [r.label, r]));
  validateInReferences(parsedResources, byLabel);
  const parsedConnections = parseConnections(root, byLabel);
  warnUnknownConnections(parsedConnections, byLabel, warnings);
  const layoutMap = parseLayout(root, byLabel, warnings);

  const nodes = buildNodes(parsedResources, parsedConnections, layoutMap);
  const edges: Edge[] = parsedConnections.map((c) => ({
    id: `e-${c.from}-${c.to}`,
    source: c.from,
    target: c.to,
  }));

  return { nodes, edges, naming, warnings };
}

function parseNaming(root: Record<string, unknown>, warnings: string[]): NamingConfig {
  const project = typeof root.project === 'string' && root.project.trim() !== ''
    ? root.project
    : DEFAULT_NAMING.project;

  let pattern = DEFAULT_NAMING.pattern;
  let commonTags = DEFAULT_NAMING.commonTags;

  const namingRaw = root.naming;
  if (namingRaw !== undefined && namingRaw !== null) {
    if (typeof namingRaw !== 'object' || Array.isArray(namingRaw)) {
      throw new ArchParseError('naming はマップ形式で記述してください');
    }
    const namingObj = namingRaw as Record<string, unknown>;
    if (namingObj.pattern !== undefined) {
      if (typeof namingObj.pattern !== 'string') {
        throw new ArchParseError('naming.pattern は文字列で指定してください');
      }
      pattern = namingObj.pattern;
    }
    if (namingObj.commonTags !== undefined) {
      if (typeof namingObj.commonTags !== 'boolean') {
        throw new ArchParseError('naming.commonTags は真偽値で指定してください');
      }
      commonTags = namingObj.commonTags;
    }
    for (const key of Object.keys(namingObj)) {
      if (key !== 'pattern' && key !== 'commonTags') {
        warnings.push(`naming内の未知のキー「${key}」は無視されました`);
      }
    }
  }

  return { project, pattern, commonTags };
}

function parseResources(
  root: Record<string, unknown>,
  warnings: string[],
): ParsedResource[] {
  const resourcesRaw = root.resources;
  if (resourcesRaw === undefined || resourcesRaw === null) return [];
  if (typeof resourcesRaw !== 'object' || Array.isArray(resourcesRaw)) {
    throw new ArchParseError('resources はマップ形式で記述してください');
  }

  const result: ParsedResource[] = [];
  for (const [label, valueRaw] of Object.entries(resourcesRaw as Record<string, unknown>)) {
    if (typeof valueRaw !== 'object' || valueRaw === null || Array.isArray(valueRaw)) {
      throw new ArchParseError(`リソース「${label}」の定義はマップ形式で記述してください`);
    }
    const value = valueRaw as Record<string, unknown>;

    const typeStr = value.type;
    if (typeof typeStr !== 'string' || typeStr.trim() === '') {
      throw new ArchParseError(`リソース「${label}」に type が指定されていません`);
    }
    if (!VALID_SERVICE_TYPES.has(typeStr)) {
      throw new ArchParseError(
        `リソース「${label}」の type「${typeStr}」は未知のサービス種別です`,
      );
    }

    let inRef: string | undefined;
    if (value.in !== undefined) {
      if (typeof value.in !== 'string' || value.in.trim() === '') {
        throw new ArchParseError(`リソース「${label}」の in は文字列で指定してください`);
      }
      inRef = value.in;
    }

    let envs: EnvId[] | undefined;
    if (value.envs !== undefined) {
      const isValidEnvArray = Array.isArray(value.envs) &&
        value.envs.every((e) => typeof e === 'string' && ENV_IDS.includes(e as EnvId));
      if (!isValidEnvArray) {
        throw new ArchParseError(
          `リソース「${label}」の envs は dev/stg/prd のみを含む配列で指定してください`,
        );
      }
      envs = value.envs as EnvId[];
    }

    let extraHcl: string | undefined;
    if (value.extra_hcl !== undefined) {
      if (typeof value.extra_hcl !== 'string') {
        throw new ArchParseError(`リソース「${label}」の extra_hcl は文字列で指定してください`);
      }
      extraHcl = value.extra_hcl;
    }

    for (const key of Object.keys(value)) {
      if (!KNOWN_RESOURCE_KEYS.has(key)) {
        warnings.push(`リソース「${label}」内の未知のキー「${key}」は無視されました`);
      }
    }

    result.push({ label, type: typeStr as ServiceType, in: inRef, envs, extraHcl });
  }
  return result;
}

function validateInReferences(
  resources: ParsedResource[],
  byLabel: Map<string, ParsedResource>,
): void {
  for (const r of resources) {
    if (r.in === undefined) continue;
    if (r.type === 'vpc') {
      throw new ArchParseError(
        `リソース「${r.label}」: VPCを別のVPCの中に配置することはできません`,
      );
    }
    const target = byLabel.get(r.in);
    if (!target) {
      throw new ArchParseError(
        `リソース「${r.label}」の in が参照するリソース「${r.in}」が存在しません`,
      );
    }
    if (target.type !== 'vpc') {
      throw new ArchParseError(
        `リソース「${r.label}」の in はvpcタイプのリソースを指定してください（「${r.in}」は${target.type}です）`,
      );
    }
  }
}

function parseConnections(
  root: Record<string, unknown>,
  byLabel: Map<string, ParsedResource>,
): ParsedConnection[] {
  const connectionsRaw = root.connections;
  if (connectionsRaw === undefined || connectionsRaw === null) return [];
  if (!Array.isArray(connectionsRaw)) {
    throw new ArchParseError('connections は配列で指定してください');
  }

  const result: ParsedConnection[] = [];
  for (const entry of connectionsRaw) {
    if (typeof entry !== 'string') {
      throw new ArchParseError(
        `connectionsの要素「${String(entry)}」は "from -> to" 形式の文字列で指定してください`,
      );
    }
    const match = entry.match(/^\s*(\S+)\s*->\s*(\S+)\s*$/);
    if (!match) {
      throw new ArchParseError(
        `connectionsの要素「${entry}」は "from -> to" 形式で指定してください`,
      );
    }
    const [, from, to] = match;
    if (!byLabel.has(from)) {
      throw new ArchParseError(`接続「${entry}」の接続元「${from}」は存在しないリソースです`);
    }
    if (!byLabel.has(to)) {
      throw new ArchParseError(`接続「${entry}」の接続先「${to}」は存在しないリソースです`);
    }
    result.push({ from, to });
  }
  return result;
}

function warnUnknownConnections(
  connections: ParsedConnection[],
  byLabel: Map<string, ParsedResource>,
  warnings: string[],
): void {
  for (const c of connections) {
    const fromType = byLabel.get(c.from)!.type;
    const toType = byLabel.get(c.to)!.type;
    const key = connectionKey(fromType, toType);
    if (!(key in CONNECTION_RULES)) {
      warnings.push(
        `接続「${c.from} -> ${c.to}」（${fromType} -> ${toType}）は既知の接続ルールに存在しないため、この接続はコード生成されません`,
      );
    }
  }
}

function parseLayout(
  root: Record<string, unknown>,
  byLabel: Map<string, ParsedResource>,
  warnings: string[],
): Map<string, number[]> {
  const layoutRaw = root.layout;
  const result = new Map<string, number[]>();
  if (layoutRaw === undefined || layoutRaw === null) return result;
  if (typeof layoutRaw !== 'object' || Array.isArray(layoutRaw)) {
    throw new ArchParseError('layout はマップ形式で指定してください');
  }
  for (const [label, coordsRaw] of Object.entries(layoutRaw as Record<string, unknown>)) {
    if (!byLabel.has(label)) {
      warnings.push(`layoutに存在しないリソース「${label}」への座標指定は無視されました`);
      continue;
    }
    if (!Array.isArray(coordsRaw) || !coordsRaw.every((n) => typeof n === 'number')) {
      throw new ArchParseError(`layoutの「${label}」は数値の配列で指定してください`);
    }
    result.set(label, coordsRaw as number[]);
  }
  return result;
}

/** vpc以外の全ノード＋全接続でdagre(LR)を実行し、絶対座標(中心→左上変換済み)を返す */
function autoLayoutNonVpc(
  labels: string[],
  connections: ParsedConnection[],
): Map<string, Point> {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120 });
  graph.setDefaultEdgeLabel(() => ({}));
  const labelSet = new Set(labels);
  for (const label of labels) {
    graph.setNode(label, { width: AUTO_NODE_WIDTH, height: AUTO_NODE_HEIGHT });
  }
  for (const c of connections) {
    if (labelSet.has(c.from) && labelSet.has(c.to)) {
      graph.setEdge(c.from, c.to);
    }
  }
  dagre.layout(graph);

  const result = new Map<string, Point>();
  for (const label of labels) {
    const n = graph.node(label);
    result.set(label, { x: n.x - n.width / 2, y: n.y - n.height / 2 });
  }
  return result;
}

function buildNodes(
  resources: ParsedResource[],
  connections: ParsedConnection[],
  layoutMap: Map<string, number[]>,
): AwsNode[] {
  const nonVpc = resources.filter((r) => r.type !== 'vpc');
  const dagrePositions = autoLayoutNonVpc(
    nonVpc.map((r) => r.label),
    connections,
  );

  // 非vpcノードの絶対座標（layout指定があれば優先して上書き）
  const absolute = new Map<string, Point>();
  for (const r of nonVpc) {
    const override = layoutMap.get(r.label);
    if (override && override.length >= 2) {
      absolute.set(r.label, { x: Math.round(override[0]), y: Math.round(override[1]) });
    } else {
      const p = dagrePositions.get(r.label)!;
      absolute.set(r.label, { x: Math.round(p.x), y: Math.round(p.y) });
    }
  }

  // vpcの位置・サイズ
  const vpcBoxes = new Map<string, VpcBox>();
  for (const r of resources) {
    if (r.type !== 'vpc') continue;
    const override = layoutMap.get(r.label);
    if (override && override.length >= 4) {
      vpcBoxes.set(r.label, {
        x: Math.round(override[0]),
        y: Math.round(override[1]),
        width: Math.round(override[2]),
        height: Math.round(override[3]),
      });
      continue;
    }
    if (override && override.length >= 2) {
      vpcBoxes.set(r.label, {
        x: Math.round(override[0]),
        y: Math.round(override[1]),
        width: DEFAULT_VPC_WIDTH,
        height: DEFAULT_VPC_HEIGHT,
      });
      continue;
    }
    const children = nonVpc.filter((c) => c.in === r.label);
    if (children.length === 0) {
      vpcBoxes.set(r.label, { x: 0, y: 0, width: DEFAULT_VPC_WIDTH, height: DEFAULT_VPC_HEIGHT });
      continue;
    }
    const xs = children.map((c) => absolute.get(c.label)!.x);
    const ys = children.map((c) => absolute.get(c.label)!.y);
    const minX = Math.min(...xs) - 60;
    const minY = Math.min(...ys) - 80;
    const maxX = Math.max(...children.map((c) => absolute.get(c.label)!.x + AUTO_NODE_WIDTH)) + 60;
    const maxY = Math.max(...children.map((c) => absolute.get(c.label)!.y + AUTO_NODE_HEIGHT)) + 60;
    vpcBoxes.set(r.label, {
      x: Math.round(minX),
      y: Math.round(minY),
      width: Math.round(maxX - minX),
      height: Math.round(maxY - minY),
    });
  }

  const nodes: AwsNode[] = [];

  // vpcノードを配列の先頭に（React Flowの親子要件）
  for (const r of resources) {
    if (r.type !== 'vpc') continue;
    const box = vpcBoxes.get(r.label)!;
    nodes.push({
      id: r.label,
      type: 'vpc',
      position: { x: box.x, y: box.y },
      style: { width: box.width, height: box.height },
      data: buildNodeData(r),
    });
  }
  for (const r of resources) {
    if (r.type === 'vpc') continue;
    const abs = absolute.get(r.label)!;
    if (r.in) {
      const box = vpcBoxes.get(r.in)!;
      nodes.push({
        id: r.label,
        type: 'aws',
        parentId: r.in,
        position: { x: abs.x - box.x, y: abs.y - box.y },
        data: buildNodeData(r),
      });
    } else {
      nodes.push({
        id: r.label,
        type: 'aws',
        position: { x: abs.x, y: abs.y },
        data: buildNodeData(r),
      });
    }
  }

  return nodes;
}

function buildNodeData(r: ParsedResource): AwsNodeData {
  return {
    serviceType: r.type,
    label: r.label,
    ...(r.envs ? { envs: r.envs } : {}),
    ...(r.extraHcl !== undefined && r.extraHcl.trim() !== '' ? { extraHcl: r.extraHcl } : {}),
  };
}

/** YAMLの識別子として安全な文字列か（プレーンスカラーとして引用符なしで出力できるか） */
function isSafePlainScalar(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.-]*$/.test(value);
}

function yamlScalar(value: string): string {
  return isSafePlainScalar(value) ? value : JSON.stringify(value);
}

/** ノードの親を辿って絶対座標を求める（vpcはparentIdを持たない前提） */
function absolutePosition(node: AwsNode, byId: Map<string, AwsNode>): Point {
  if (!node.parentId) return { x: node.position.x, y: node.position.y };
  const parent = byId.get(node.parentId);
  if (!parent) return { x: node.position.x, y: node.position.y };
  const parentAbs = absolutePosition(parent, byId);
  return { x: parentAbs.x + node.position.x, y: parentAbs.y + node.position.y };
}

// ---------- serialize: 内部モデル → YAMLテキストの共通データ組み立て ----------

/** serialize時の1リソース分の内容（labelは重複解消済みの一意な値） */
interface SerializeResourceEntry {
  label: string;
  type: ServiceType;
  in?: string;
  envs?: EnvId[];
  extraHcl?: string;
}

/** serialize時の1接続分の内容 */
interface SerializeConnectionEntry {
  from: string;
  to: string;
}

/** serialize時の1レイアウトエントリ（vpcは[x,y,w,h]、それ以外は[x,y]） */
interface SerializeLayoutEntry {
  label: string;
  values: number[];
}

/** 新規生成モードと差分適用モードの両方から使う、直列化対象の共通データ */
interface SerializeModel {
  resources: SerializeResourceEntry[];
  connections: SerializeConnectionEntry[];
  layout: SerializeLayoutEntry[];
}

/**
 * ノード/エッジから直列化用の中間データを組み立てる。
 * label重複の一意化・vpc優先順・親からの絶対座標変換など、
 * 新規生成／差分適用の両モードで共通のロジックをここに集約する。
 */
function buildSerializeModel(nodes: AwsNode[], edges: Edge[]): SerializeModel {
  // vpcノードを先頭に（元の相対順序は維持）
  const ordered = [...nodes].sort((a, b) => {
    const av = a.data.serviceType === 'vpc' ? 0 : 1;
    const bv = b.data.serviceType === 'vpc' ? 0 : 1;
    return av - bv;
  });

  // labelの重複を -2 -3 ... で一意化
  const usedLabels = new Set<string>();
  const idToLabel = new Map<string, string>();
  for (const n of ordered) {
    const baseLabel = n.data.label;
    let candidate = baseLabel;
    let i = 2;
    while (usedLabels.has(candidate)) {
      candidate = `${baseLabel}-${i++}`;
    }
    usedLabels.add(candidate);
    idToLabel.set(n.id, candidate);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  const resources: SerializeResourceEntry[] = ordered.map((n) => ({
    label: idToLabel.get(n.id)!,
    type: n.data.serviceType,
    in: n.parentId ? idToLabel.get(n.parentId) : undefined,
    envs: n.data.envs && n.data.envs.length > 0 ? n.data.envs : undefined,
    extraHcl: n.data.extraHcl && n.data.extraHcl.trim() !== '' ? n.data.extraHcl : undefined,
  }));

  const connections: SerializeConnectionEntry[] = edges.map((e) => ({
    from: idToLabel.get(e.source) ?? e.source,
    to: idToLabel.get(e.target) ?? e.target,
  }));

  const layout: SerializeLayoutEntry[] = ordered.map((n) => {
    const label = idToLabel.get(n.id)!;
    const abs = absolutePosition(n, byId);
    const x = Math.round(abs.x);
    const y = Math.round(abs.y);
    if (n.data.serviceType === 'vpc') {
      const width = Math.round(
        typeof n.style?.width === 'number' ? n.style.width : DEFAULT_VPC_WIDTH,
      );
      const height = Math.round(
        typeof n.style?.height === 'number' ? n.style.height : DEFAULT_VPC_HEIGHT,
      );
      return { label, values: [x, y, width, height] };
    }
    return { label, values: [x, y] };
  });

  return { resources, connections, layout };
}

/** 内部モデル → YAMLテキストを新規に手組みする（従来どおりの安定した出力） */
function serializeArchYamlFresh(nodes: AwsNode[], edges: Edge[], naming: NamingConfig): string {
  const model = buildSerializeModel(nodes, edges);

  const lines: string[] = [];
  lines.push('version: 1');
  lines.push(`project: ${yamlScalar(naming.project)}`);
  lines.push('naming:');
  lines.push(`  pattern: ${yamlScalar(naming.pattern)}`);
  lines.push(`  commonTags: ${naming.commonTags}`);
  lines.push('');

  lines.push('resources:');
  for (const r of model.resources) {
    lines.push(`  ${yamlScalar(r.label)}:`);
    lines.push(`    type: ${r.type}`);
    if (r.in) lines.push(`    in: ${yamlScalar(r.in)}`);
    if (r.envs) lines.push(`    envs: [${r.envs.join(', ')}]`);
    if (r.extraHcl) {
      lines.push('    extra_hcl: |');
      for (const rawLine of r.extraHcl.split('\n')) {
        lines.push(rawLine === '' ? '' : `      ${rawLine}`);
      }
    }
  }
  lines.push('');

  lines.push('connections:');
  for (const c of model.connections) {
    const bothSafe = isSafePlainScalar(c.from) && isSafePlainScalar(c.to);
    const connStr = `${c.from} -> ${c.to}`;
    lines.push(`  - ${bothSafe ? connStr : JSON.stringify(connStr)}`);
  }
  lines.push('');

  lines.push('layout:');
  for (const l of model.layout) {
    lines.push(`  ${yamlScalar(l.label)}: [${l.values.join(', ')}]`);
  }

  return lines.join('\n') + '\n';
}

// ---------- serialize: 差分適用モード（previousText由来のコメント等を保持する） ----------

/** マップのキーをJSの文字列として取り出す（Scalarキー・プレーン値のどちらでも動くように） */
function scalarKeyToString(key: unknown): string {
  return isScalar(key) ? String(key.value) : String(key);
}

/** 親マップのkeyが既存のYAMLMapならそれを返し、無ければ新規マップを作って差し込む */
function getOrCreateMap(parent: YAMLMap, key: string): YAMLMap {
  const existing = parent.get(key, true);
  if (isMap(existing)) return existing as YAMLMap;
  const created = new YAMLMap();
  parent.set(key, created);
  return created;
}

/** シーケンス（配列）ノードをJSの配列として読む。スカラー配列以外・未指定はundefined */
function readSeqValues(doc: Document, path: string[]): unknown[] | undefined {
  const node = doc.getIn(path);
  if (node === undefined) return undefined;
  if (!isSeq(node)) return undefined;
  return node.items.map((it) => (isScalar(it) ? it.value : it));
}

function arraysEqual(a: unknown[] | undefined, b: readonly unknown[]): boolean {
  if (a === undefined) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** flowスタイル（`[a, b]`のような一行表記）のシーケンスノードを作る */
function createFlowSeq<T extends string | number>(values: readonly T[]): YAMLSeq {
  const seq = new YAMLSeq();
  seq.flow = true;
  for (const v of values) seq.items.push(new Scalar(v));
  return seq;
}

/** ブロックリテラル（`|`）スタイルの文字列スカラーノードを作る（extra_hcl用） */
function createBlockLiteralScalar(text: string): Scalar {
  const scalar = new Scalar(text);
  scalar.type = Scalar.BLOCK_LITERAL;
  return scalar;
}

/** 新規リソース用のYAMLMapを組み立てる（type→in→envs→extra_hclの順） */
function buildResourceNode(entry: SerializeResourceEntry): YAMLMap {
  const map = new YAMLMap();
  map.set('type', entry.type);
  if (entry.in !== undefined) map.set('in', entry.in);
  if (entry.envs !== undefined) map.set('envs', createFlowSeq(entry.envs));
  if (entry.extraHcl !== undefined) map.set('extra_hcl', createBlockLiteralScalar(entry.extraHcl));
  return map;
}

/** 既存リソースの中身を、変わったフィールドだけ更新する（同じ値は触らずコメント等を保つ） */
function patchResourceFields(doc: Document, entry: SerializeResourceEntry): void {
  const path = ['resources', entry.label];

  if (doc.getIn([...path, 'type']) !== entry.type) {
    doc.setIn([...path, 'type'], entry.type);
  }

  const currentIn = doc.getIn([...path, 'in']);
  if (entry.in === undefined) {
    if (currentIn !== undefined) doc.deleteIn([...path, 'in']);
  } else if (currentIn !== entry.in) {
    doc.setIn([...path, 'in'], entry.in);
  }

  const currentEnvs = readSeqValues(doc, [...path, 'envs']);
  if (entry.envs === undefined) {
    if (currentEnvs !== undefined) doc.deleteIn([...path, 'envs']);
  } else if (!arraysEqual(currentEnvs, entry.envs)) {
    doc.setIn([...path, 'envs'], createFlowSeq(entry.envs));
  }

  const currentExtraHcl = doc.getIn([...path, 'extra_hcl']);
  if (entry.extraHcl === undefined) {
    if (currentExtraHcl !== undefined) doc.deleteIn([...path, 'extra_hcl']);
  } else if (currentExtraHcl !== entry.extraHcl) {
    doc.setIn([...path, 'extra_hcl'], createBlockLiteralScalar(entry.extraHcl));
  }
}

/**
 * resources を差分適用する。
 * 残っているキーは中身だけ更新（未変更フィールドは触らない）、
 * 消えたキーは削除、新規キーは末尾に追加する。リネームは削除＋追加として扱う。
 */
function patchResources(doc: Document, resources: SerializeResourceEntry[]): void {
  const resourcesNode = getOrCreateMap(doc.contents as YAMLMap, 'resources');
  const targetLabels = new Set(resources.map((r) => r.label));

  for (const pair of [...resourcesNode.items]) {
    if (!targetLabels.has(scalarKeyToString(pair.key))) resourcesNode.delete(pair.key);
  }

  for (const entry of resources) {
    if (resourcesNode.has(entry.label)) {
      patchResourceFields(doc, entry);
    } else {
      resourcesNode.set(entry.label, buildResourceNode(entry));
    }
  }
}

/** "from -> to" 形式の接続文字列を組み立てる */
function connectionText(from: string, to: string): string {
  return `${from} -> ${to}`;
}

const CONNECTION_LINE_RE = /^\s*(\S+)\s*->\s*(\S+)\s*$/;

/**
 * connections を差分適用する。内容（順序含む）が完全に一致していれば触らない。
 * 変わっている場合は配列を作り直すが、"a -> b" の内容が一致する既存アイテムは
 * 再利用するため、該当行の行コメントはできるだけ保たれる。
 */
function patchConnections(doc: Document, connections: SerializeConnectionEntry[]): void {
  const targetKeys = connections.map((c) => connectionText(c.from, c.to));

  const existingNode = doc.getIn(['connections']);
  const existingItems = isSeq(existingNode) ? existingNode.items : [];
  const existingKeys = existingItems.map((item) => {
    const raw = isScalar(item) ? String(item.value) : String(item);
    const match = raw.match(CONNECTION_LINE_RE);
    return match ? connectionText(match[1], match[2]) : raw;
  });

  const unchanged = existingKeys.length === targetKeys.length &&
    existingKeys.every((k, i) => k === targetKeys[i]);
  if (unchanged) return;

  const pool = new Map<string, unknown[]>();
  existingItems.forEach((item, i) => {
    const key = existingKeys[i];
    const list = pool.get(key) ?? [];
    list.push(item);
    pool.set(key, list);
  });

  const newSeq = new YAMLSeq();
  for (const key of targetKeys) {
    const reused = pool.get(key)?.shift();
    newSeq.items.push(reused ?? key);
  }
  doc.set('connections', newSeq);
}

/**
 * layout を差分適用する。座標は編集のたびにほぼ必ず変わるため、
 * ラベルごとに値を比較し、変わっていれば `doc.setIn` で更新する。
 * 消えたリソースのlayoutエントリは合わせて削除する。
 */
function patchLayout(doc: Document, layout: SerializeLayoutEntry[]): void {
  const rootMap = doc.contents as YAMLMap;
  const existing = rootMap.get('layout', true);
  const layoutNode = isMap(existing) ? (existing as YAMLMap) : undefined;

  if (layout.length === 0) {
    if (layoutNode) {
      for (const pair of [...layoutNode.items]) layoutNode.delete(pair.key);
    }
    return;
  }

  const map = layoutNode ?? getOrCreateMap(rootMap, 'layout');
  const targetLabels = new Set(layout.map((l) => l.label));

  for (const pair of [...map.items]) {
    if (!targetLabels.has(scalarKeyToString(pair.key))) map.delete(pair.key);
  }

  for (const entry of layout) {
    const current = readSeqValues(doc, ['layout', entry.label]);
    if (!arraysEqual(current, entry.values)) {
      doc.setIn(['layout', entry.label], createFlowSeq(entry.values));
    }
  }
}

/** version / project / naming を、値が変わっている場合だけ更新する */
function patchTopLevelScalars(doc: Document, naming: NamingConfig): void {
  if (doc.get('version') !== 1) {
    doc.set('version', 1);
  }

  const currentProject = doc.has('project') ? doc.get('project') : DEFAULT_NAMING.project;
  if (currentProject !== naming.project) {
    doc.set('project', naming.project);
  }

  const currentPattern = doc.hasIn(['naming', 'pattern'])
    ? doc.getIn(['naming', 'pattern'])
    : DEFAULT_NAMING.pattern;
  if (currentPattern !== naming.pattern) {
    doc.setIn(['naming', 'pattern'], naming.pattern);
  }

  const currentCommonTags = doc.hasIn(['naming', 'commonTags'])
    ? doc.getIn(['naming', 'commonTags'])
    : DEFAULT_NAMING.commonTags;
  if (currentCommonTags !== naming.commonTags) {
    doc.setIn(['naming', 'commonTags'], naming.commonTags);
  }
}

/**
 * previousText（直前のドキュメント本文）に差分を適用してYAMLを組み立てる。
 * previousTextが有効なarchfileとしてパースできない場合はnullを返す
 * （呼び出し側で新規生成にフォールバックすること）。
 */
function tryPatchArchYaml(
  nodes: AwsNode[],
  edges: Edge[],
  naming: NamingConfig,
  previousText: string,
): string | null {
  if (previousText.trim() === '') return null;

  try {
    // previousTextが致命的な問題のないarchfileであることの検証のみに使う
    parseArchYaml(previousText);
  } catch {
    return null;
  }

  let doc: Document;
  try {
    doc = parseDocument(previousText);
  } catch {
    return null;
  }
  if (doc.errors.length > 0 || !isMap(doc.contents)) return null;

  const model = buildSerializeModel(nodes, edges);
  patchTopLevelScalars(doc, naming);
  patchResources(doc, model.resources);
  patchConnections(doc, model.connections);
  patchLayout(doc, model.layout);

  // flowCollectionPadding: yaml側の既定(true)だと envs/layout の `[a, b]` が
  // `[ a, b ]` に変わってしまい、触っていない箇所まで差分が生じる。falseにして
  // 手組み生成（serializeArchYamlFresh）の書式に近づける
  return doc.toString({ flowCollectionPadding: false });
}

/**
 * 内部モデル → YAMLテキスト（安定した順序で出力。差分が意味を持つように）。
 *
 * `previousText` を渡すと、そのテキストへ差分適用してコメント・キー順・
 * 引用符スタイルを可能な限り保持する（yamlパッケージのDocument API使用）。
 * 省略した場合、および previousText が有効なarchfileとしてパースできない
 * 場合は、従来どおりの新規生成にフォールバックする（例外は投げない）。
 *
 * 既知の制限: リソースのリネームは「削除＋追加」として扱われ、
 * そのリソースに付いていたコメントは失われる。
 */
export function serializeArchYaml(
  nodes: AwsNode[],
  edges: Edge[],
  naming: NamingConfig,
  previousText?: string,
): string {
  if (previousText !== undefined) {
    const patched = tryPatchArchYaml(nodes, edges, naming, previousText);
    if (patched !== null) return patched;
  }
  return serializeArchYamlFresh(nodes, edges, naming);
}
