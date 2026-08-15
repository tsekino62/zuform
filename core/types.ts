import type { Edge, Node } from '@xyflow/react';

/** 生成されるTerraformコード内のコメント・ヒント文の言語 */
export type Locale = 'ja' | 'en';

export type ServiceType =
  | 'apigateway'
  | 'lambda'
  | 'ec2'
  | 'rds'
  | 'dynamodb'
  | 's3'
  | 'sqs'
  | 'sns'
  | 'eventbridge'
  | 'stepfunctions'
  | 'cloudfront'
  | 'vpc';

// ---------- 環境 ----------

export type EnvId = 'dev' | 'stg' | 'prd';

export const ENV_IDS: EnvId[] = ['dev', 'stg', 'prd'];

export interface EnvProfile {
  id: EnvId;
  label: string;
  /** 環境ごとの既定値。DEVは小さく安く、PRDは堅牢に */
  rds: {
    instanceClass: string;
    multiAz: boolean;
    deletionProtection: boolean;
    skipFinalSnapshot: boolean;
    backupRetentionDays: number;
  };
  ec2: {
    instanceType: string;
  };
}

export const ENV_PROFILES: Record<EnvId, EnvProfile> = {
  dev: {
    id: 'dev',
    label: 'DEV',
    rds: {
      instanceClass: 'db.t3.micro',
      multiAz: false,
      deletionProtection: false,
      skipFinalSnapshot: true,
      backupRetentionDays: 0,
    },
    ec2: { instanceType: 't3.micro' },
  },
  stg: {
    id: 'stg',
    label: 'STG',
    rds: {
      instanceClass: 'db.t3.small',
      multiAz: false,
      deletionProtection: false,
      skipFinalSnapshot: false,
      backupRetentionDays: 3,
    },
    ec2: { instanceType: 't3.small' },
  },
  prd: {
    id: 'prd',
    label: 'PRD',
    rds: {
      instanceClass: 'db.t3.small',
      multiAz: true,
      deletionProtection: true,
      skipFinalSnapshot: false,
      backupRetentionDays: 7,
    },
    ec2: { instanceType: 't3.medium' },
  },
};

// ---------- ノード ----------

export type AwsNodeData = {
  serviceType: ServiceType;
  label: string;
  /** このノードを含める環境。未指定 = 全環境 */
  envs?: EnvId[];
  /** ノードの主リソースブロック末尾に挿入される生HCL（上級者向け） */
  extraHcl?: string;
};

export type AwsNode = Node<AwsNodeData>;

// ---------- 命名規則 ----------

export interface NamingConfig {
  /** プロジェクト名（{project} に入る） */
  project: string;
  /** 物理リソース名のパターン。使えるトークン: {project} {env} {name} */
  pattern: string;
  /** Project / Environment / ManagedBy の共通タグを全リソースに付与 */
  commonTags: boolean;
}

export const DEFAULT_NAMING: NamingConfig = {
  project: 'myapp',
  pattern: '{project}-{env}-{name}',
  commonTags: true,
};

// ---------- コード生成 ----------

export interface GenerateResult {
  code: string;
  hints: string[];
}

/** サービスモジュールのgenerate等に渡されるコンテキスト */
export interface GenContext {
  env: EnvId;
  profile: EnvProfile;
  naming: NamingConfig;
  nodes: AwsNode[];
  edges: Edge[];
  hints: string[];
  /** 生成コードのコメント・ヒント文の言語 */
  locale: Locale;
  /**
   * ロケールに応じて日本語／英語のどちらかを返す。
   * 生成コードの文言はテンプレート文字列と一体で読めるよう、
   * 辞書ファイルではなく呼び出し箇所にインラインで両言語を書く。
   */
  tr(ja: string, en: string): string;
  /** Terraformの論理名（resource "aws_x" "この部分"）。環境に依存しない */
  name(node: AwsNode): string;
  /** 命名規則を適用した物理リソース名。suffixは "-sg" など */
  physicalName(node: AwsNode, suffix?: string): string;
  parentVpc(node: AwsNode): AwsNode | undefined;
  targetsOf(node: AwsNode, type: ServiceType): AwsNode[];
  sourcesOf(node: AwsNode, type: ServiceType): AwsNode[];
  byType(type: ServiceType): AwsNode[];
  /** LambdaがVPC設定を必要とする場合、そのVPCノードを返す */
  lambdaVpc(node: AwsNode): AwsNode | undefined;
  /** ノードの追加HCL（extraHcl）を主リソースブロックへ挿入する断片を返す */
  extraBlock(node: AwsNode): string;
}

/**
 * サービス1種につき1モジュール。
 * 新しいAWSサービスの追加 = このインターフェースの実装を1ファイル書いて
 * registry/index.ts に登録するだけ。
 */
export interface ServiceModule {
  type: ServiceType;
  /** パレット表示名 */
  displayName: string;
  category: string;
  description: string;
  /** VPCのようなグループ（枠）ノードか */
  isGroup?: boolean;
  /** このサービスから矢印を引ける相手と、その接続の意味 */
  connectsTo?: Partial<Record<ServiceType, string>>;
  /** 環境ごとに1回だけ出力する variable ブロック等（このサービスの利用時のみ） */
  variables?(ctx: GenContext): string;
  generate(node: AwsNode, ctx: GenContext): string;
  outputs?(node: AwsNode, ctx: GenContext): string;
}
