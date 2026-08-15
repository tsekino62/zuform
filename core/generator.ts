import type { Edge } from '@xyflow/react';
import type {
  AwsNode,
  EnvId,
  GenContext,
  GenerateResult,
  NamingConfig,
  ServiceType,
} from './types.ts';
import { ENV_IDS, ENV_PROFILES } from './types.ts';
import { MODULES, REGISTRY } from './registry/index.ts';

/** ラベルを Terraform のリソース名として安全な snake_case に変換する */
export function toLogicalName(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9]+/, '');
}

/** ラベルを物理リソース名向けの kebab-case に変換する */
export function toKebabName(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[0-9]+/, '');
}

/** 命名パターンにトークンを適用する */
export function applyNamingPattern(
  pattern: string,
  values: { project: string; env: string; name: string },
): string {
  return pattern
    .replace(/\{project\}/g, values.project)
    .replace(/\{env\}/g, values.env)
    .replace(/\{name\}/g, values.name)
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

function headerFor(env: EnvId, naming: NamingConfig): string {
  const tagsBlock = naming.commonTags
    ? `

  # このファイルが作る全リソースに共通タグを自動付与する
  default_tags {
    tags = {
      Project     = "${naming.project}"
      Environment = "${env}"
      ManagedBy   = "terraform"
    }
  }`
    : '';
  return `# ============================================================
# 環境: ${env.toUpperCase()}
# このファイルは Zuform で作成した構成図から自動生成されました
# 実行方法（この環境のディレクトリで）:
#   terraform init   … 初回のみ。プラグインをダウンロード
#   terraform plan   … 何が作成されるかを事前確認
#   terraform apply  … 実際にAWSへリソースを作成
#   terraform destroy … 作成したリソースをすべて削除
# ============================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region${tagsBlock}
}

variable "region" {
  description = "リソースを作成するAWSリージョン"
  type        = string
  default     = "ap-northeast-1" # 東京リージョン
}
`;
}

/** ノードが指定環境に含まれるか（envs未指定 = 全環境） */
export function nodeInEnv(node: AwsNode, env: EnvId): boolean {
  return !node.data.envs || node.data.envs.includes(env);
}

function buildContext(
  env: EnvId,
  nodes: AwsNode[],
  edges: Edge[],
  naming: NamingConfig,
): GenContext {
  const nodesById = new Map(nodes.map((n) => [n.id, n]));

  // 論理名の割り当て（重複はサフィックスで回避）
  const names = new Map<string, string>();
  const used = new Set<string>();
  const counters: Partial<Record<ServiceType, number>> = {};
  for (const n of nodes) {
    const count = (counters[n.data.serviceType] ?? 0) + 1;
    counters[n.data.serviceType] = count;
    let base = toLogicalName(n.data.label);
    if (!base) base = `${n.data.serviceType}_${count}`;
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}_${i++}`;
    used.add(name);
    names.set(n.id, name);
  }

  const ctx: GenContext = {
    env,
    profile: ENV_PROFILES[env],
    naming,
    nodes,
    edges,
    hints: [],
    name: (node) => names.get(node.id) ?? 'unnamed',
    physicalName: (node, suffix = '') => {
      let name = toKebabName(node.data.label);
      if (!name) name = ctx.name(node).replace(/_/g, '-');
      return (
        applyNamingPattern(naming.pattern, {
          project: toKebabName(naming.project) || 'myapp',
          env,
          name,
        }) + suffix
      );
    },
    parentVpc: (node) => {
      if (!node.parentId) return undefined;
      const parent = nodesById.get(node.parentId);
      return parent?.data.serviceType === 'vpc' ? parent : undefined;
    },
    targetsOf: (node, type) =>
      edges
        .filter((e) => e.source === node.id)
        .map((e) => nodesById.get(e.target))
        .filter((n): n is AwsNode => !!n && n.data.serviceType === type),
    sourcesOf: (node, type) =>
      edges
        .filter((e) => e.target === node.id)
        .map((e) => nodesById.get(e.source))
        .filter((n): n is AwsNode => !!n && n.data.serviceType === type),
    byType: (type) => nodes.filter((n) => n.data.serviceType === type),
    lambdaVpc: (node) => {
      const own = ctx.parentVpc(node);
      if (own) return own;
      // RDSに接続している場合は、そのRDSが属するVPCを使う
      for (const rds of ctx.targetsOf(node, 'rds')) {
        const vpc = ctx.parentVpc(rds);
        if (vpc) return vpc;
      }
      return undefined;
    },
    extraBlock: (node) => {
      const raw = node.data.extraHcl;
      if (!raw || raw.trim() === '') return '';
      const lines = raw.split('\n').map((line) => {
        const trimmed = line.replace(/[ \t]+$/, '');
        return trimmed === '' ? '' : `  ${trimmed}`;
      });
      return `\n\n  # --- 追加設定（インスペクタの「追加HCL」から挿入） ---\n${lines.join('\n')}`;
    },
  };
  return ctx;
}

/** 1環境分の Terraform コードを生成する */
export function generateForEnv(
  allNodes: AwsNode[],
  allEdges: Edge[],
  env: EnvId,
  naming: NamingConfig,
): GenerateResult {
  // 環境フラグでノードを絞り込む。除外されたVPCの中のノードも除外
  const excluded: AwsNode[] = [];
  const included: AwsNode[] = [];
  const directlyIncluded = new Map(
    allNodes.map((n) => [n.id, nodeInEnv(n, env)] as const),
  );
  for (const n of allNodes) {
    const parentExcluded = n.parentId && directlyIncluded.get(n.parentId) === false;
    if (directlyIncluded.get(n.id) && !parentExcluded) {
      included.push(n);
    } else {
      excluded.push(n);
    }
  }
  const nodes = included;
  const ids = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter((e) => ids.has(e.source) && ids.has(e.target));

  if (allNodes.length === 0) {
    return {
      code: `${headerFor(env, naming)}\n# 左のパレットからアイコンをキャンバスへドラッグすると、\n# ここにTerraformコードが自動生成されます。\n`,
      hints: ['左のパレットからアイコンをドラッグして、構成図を作り始めましょう。'],
    };
  }

  const ctx = buildContext(env, nodes, edges, naming);

  // マネージドサービスがVPC内に置かれていたら初心者向けにヒントを出す
  for (const n of nodes) {
    const t = n.data.serviceType;
    if ((t === 'apigateway' || t === 'dynamodb' || t === 's3') && ctx.parentVpc(n)) {
      ctx.hints.push(
        `${n.data.label}（${MODULES[t].displayName}）はVPCの外で動くマネージドサービスです。VPC枠の外に配置するのが一般的です。`,
      );
    }
  }

  const sections: string[] = [headerFor(env, naming)];

  if (excluded.length > 0) {
    sections.push(
      `\n# この環境（${env.toUpperCase()}）では以下のリソースは対象外です:\n${excluded
        .map((n) => `#   - ${n.data.label}`)
        .join('\n')}\n`,
    );
  }

  // variables（各サービスモジュールが必要とするもの）
  for (const m of REGISTRY) {
    const block = m.variables?.(ctx) ?? '';
    if (block.trim()) sections.push(`\n# ---------- 変数 ----------\n${block}`);
  }

  // リソース本体の出力順（VPC・データストアを先に、入口系を後に）
  const genOrder: ServiceType[] = [
    'vpc',
    's3',
    'dynamodb',
    'sqs',
    'sns',
    'lambda',
    'stepfunctions',
    'rds',
    'ec2',
    'apigateway',
    'eventbridge',
    'cloudfront',
  ];
  for (const type of genOrder) {
    for (const node of ctx.byType(type)) {
      sections.push(MODULES[type].generate(node, ctx));
    }
  }

  // outputs
  const outputs: string[] = [];
  for (const type of genOrder) {
    const m = MODULES[type];
    if (!m.outputs) continue;
    for (const node of ctx.byType(type)) {
      const block = m.outputs(node, ctx);
      if (block.trim()) outputs.push(block);
    }
  }
  if (outputs.length > 0) {
    sections.push(`
# ---------- 出力（apply後に表示される値） ----------
${outputs.join('\n')}
`);
  }

  // Lambdaがどこからも呼ばれていない場合のヒント
  for (const fn of ctx.byType('lambda')) {
    const hasTrigger = edges.some((e) => e.target === fn.id);
    if (!hasTrigger) {
      ctx.hints.push(
        `Lambda「${fn.data.label}」を呼び出すサービスがありません。API Gatewayから矢印でつなぐとHTTP APIになります。`,
      );
    }
  }

  return { code: sections.join(''), hints: ctx.hints };
}

/** DEV / STG / PRD 全環境分をまとめて生成する */
export function generateAll(
  nodes: AwsNode[],
  edges: Edge[],
  naming: NamingConfig,
): Record<EnvId, GenerateResult> {
  return Object.fromEntries(
    ENV_IDS.map((env) => [env, generateForEnv(nodes, edges, env, naming)]),
  ) as Record<EnvId, GenerateResult>;
}
