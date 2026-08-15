import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { assertSnapshot } from '@std/testing/snapshot';
import {
  applyNamingPattern,
  generateAll,
  generateForEnv,
  toKebabName,
  toLogicalName,
} from './generator.ts';
import { DEFAULT_NAMING } from './types.ts';
import type { AwsNode } from './types.ts';
import { CONNECTION_RULES } from './registry/index.ts';
import { TEMPLATES } from '../flow/templates.ts';

function tpl(id: string): { nodes: AwsNode[]; edges: { id: string; source: string; target: string }[] } {
  const t = TEMPLATES.find((t) => t.id === id);
  if (!t) throw new Error(`template not found: ${id}`);
  return { nodes: t.nodes, edges: t.edges };
}

// ---------- 命名ユーティリティ ----------

Deno.test('toLogicalName: 記号や日本語を安全なsnake_caseへ', () => {
  assertEquals(toLogicalName('user-api'), 'user_api');
  assertEquals(toLogicalName('My App 2'), 'my_app_2');
  assertEquals(toLogicalName('日本語のみ'), '');
  assertEquals(toLogicalName('123abc'), 'abc');
});

Deno.test('toKebabName: kebab-caseへ変換', () => {
  assertEquals(toKebabName('users_db'), 'users-db');
  assertEquals(toKebabName('Get Users'), 'get-users');
});

Deno.test('applyNamingPattern: トークン適用と連続ハイフンの圧縮', () => {
  assertEquals(
    applyNamingPattern('{project}-{env}-{name}', { project: 'shop', env: 'dev', name: 'api' }),
    'shop-dev-api',
  );
  assertEquals(
    applyNamingPattern('{project}--{name}', { project: 'shop', env: 'dev', name: 'api' }),
    'shop-api',
  );
});

// ---------- 接続ルール ----------

Deno.test('CONNECTION_RULES: レジストリから定番の接続が導出される', () => {
  assert(CONNECTION_RULES['apigateway->lambda']);
  assert(CONNECTION_RULES['lambda->rds']);
  assert(CONNECTION_RULES['lambda->dynamodb']);
  assert(CONNECTION_RULES['lambda->s3']);
  assert(CONNECTION_RULES['lambda->sqs']);
  assert(CONNECTION_RULES['lambda->sns']);
  assert(CONNECTION_RULES['sqs->lambda']);
  assert(CONNECTION_RULES['sns->lambda']);
  assert(CONNECTION_RULES['eventbridge->lambda']);
  assert(CONNECTION_RULES['eventbridge->stepfunctions']);
  assert(CONNECTION_RULES['stepfunctions->lambda']);
  assert(CONNECTION_RULES['cloudfront->s3']);
  assert(CONNECTION_RULES['ec2->rds']);
  assertEquals(CONNECTION_RULES['rds->lambda'], undefined);
  assertEquals(CONNECTION_RULES['s3->cloudfront'], undefined);
});

// ---------- 生成結果のスナップショット ----------

Deno.test('空の図: 案内コメントとヒントを返す', () => {
  const { code, hints } = generateForEnv([], [], 'dev', DEFAULT_NAMING);
  assertStringIncludes(code, 'ドラッグ');
  assertEquals(hints.length, 1);
});

Deno.test('サーバーレスAPIテンプレート(dev)のスナップショット', async (t) => {
  const { nodes, edges } = tpl('serverless-api');
  const { code, hints } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertEquals(hints, []);
  await assertSnapshot(t, code);
});

Deno.test('RDB構成テンプレート: devとprdで環境プロファイルが異なる', async (t) => {
  const { nodes, edges } = tpl('web-db-api');
  const dev = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  const prd = generateForEnv(nodes, edges, 'prd', DEFAULT_NAMING);

  assertStringIncludes(dev.code, 'db.t3.micro');
  assertStringIncludes(dev.code, 'skip_final_snapshot     = true');
  assertStringIncludes(dev.code, 'deletion_protection     = false');

  assertStringIncludes(prd.code, 'multi_az                = true');
  assertStringIncludes(prd.code, 'deletion_protection     = true');
  assertStringIncludes(prd.code, 'skip_final_snapshot     = false');

  await assertSnapshot(t, prd.code);
});

Deno.test('命名規則: 物理名にパターンとプロジェクト名が反映される', () => {
  const { nodes, edges } = tpl('serverless-api');
  const { code } = generateForEnv(nodes, edges, 'stg', {
    project: 'Kusuri Shop',
    pattern: '{project}-{env}-{name}',
    commonTags: true,
  });
  assertStringIncludes(code, 'function_name = "kusuri-shop-stg-items-handler"');
  assertStringIncludes(code, 'name         = "kusuri-shop-stg-items-table"');
  assertStringIncludes(code, 'Project     = "Kusuri Shop"');
  assertStringIncludes(code, 'Environment = "stg"');
});

Deno.test('共通タグ無効時はdefault_tagsを出力しない', () => {
  const { nodes, edges } = tpl('serverless-api');
  const { code } = generateForEnv(nodes, edges, 'dev', {
    ...DEFAULT_NAMING,
    commonTags: false,
  });
  assert(!code.includes('default_tags'));
});

// ---------- 環境フラグ ----------

Deno.test('環境フラグ: PRD限定ノードはDEVのコードから除外される', () => {
  const { nodes, edges } = tpl('serverless-api');
  const withEnvs = nodes.map((n) =>
    n.data.serviceType === 'dynamodb'
      ? { ...n, data: { ...n.data, envs: ['prd' as const] } }
      : n,
  );
  const dev = generateForEnv(withEnvs, edges, 'dev', DEFAULT_NAMING);
  const prd = generateForEnv(withEnvs, edges, 'prd', DEFAULT_NAMING);

  assert(!dev.code.includes('aws_dynamodb_table'));
  assertStringIncludes(dev.code, 'この環境（DEV）では以下のリソースは対象外です');
  // 接続先が消えるため、IAMポリシーや環境変数も生成されない
  assert(!dev.code.includes('TABLE_NAME'));
  assertStringIncludes(prd.code, 'aws_dynamodb_table');
  assertStringIncludes(prd.code, 'TABLE_NAME');
});

Deno.test('環境フラグ: 除外されたVPC内の子ノードも一緒に除外される', () => {
  const { nodes, edges } = tpl('web-db-api');
  const withEnvs = nodes.map((n) =>
    n.data.serviceType === 'vpc' ? { ...n, data: { ...n.data, envs: ['prd' as const] } } : n,
  );
  const dev = generateForEnv(withEnvs, edges, 'dev', DEFAULT_NAMING);
  assert(!dev.code.includes('aws_vpc'));
  assert(!dev.code.includes('aws_db_instance'));
});

// ---------- IAM / 接続セマンティクス ----------

Deno.test('Lambda→DynamoDB: 最小権限のIAMポリシーが生成される', () => {
  const { nodes, edges } = tpl('serverless-api');
  const { code } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertStringIncludes(code, 'aws_iam_role_policy');
  assertStringIncludes(code, '"dynamodb:GetItem"');
  assertStringIncludes(code, 'Resource = aws_dynamodb_table.items_table.arn');
});

Deno.test('Lambda→RDS: VPC設定とセキュリティグループの相互参照が生成される', () => {
  const { nodes, edges } = tpl('web-db-api');
  const { code } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertStringIncludes(code, 'vpc_config');
  assertStringIncludes(code, 'AWSLambdaVPCAccessExecutionRole');
  assertStringIncludes(code, 'security_groups = [aws_security_group.get_users_sg.id]');
  assertStringIncludes(code, 'variable "db_password"');
});

Deno.test('VPC外のRDS: コードを生成せずヒントを出す', () => {
  const nodes: AwsNode[] = [
    {
      id: 'rds1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'rds', label: 'lonely-db' },
    },
  ];
  const { code, hints } = generateForEnv(nodes, [], 'dev', DEFAULT_NAMING);
  assert(!code.includes('aws_db_instance'));
  assert(hints.some((h) => h.includes('VPC')));
});

// ---------- 新サービス: SQS / EventBridge / Step Functions / CloudFront ----------

Deno.test('SQS→Lambda: イベントソースと消費権限、Lambda→SQS: 送信権限が生成される', () => {
  const { nodes, edges } = tpl('async-worker');
  const { code } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  // enqueue側: 送信権限 + QUEUE_URL環境変数
  assertStringIncludes(code, '"sqs:SendMessage"');
  assertStringIncludes(code, 'QUEUE_URL = aws_sqs_queue.jobs_queue.url');
  // worker側: イベントソースマッピング + 受信権限
  assertStringIncludes(code, 'aws_lambda_event_source_mapping');
  assertStringIncludes(code, '"sqs:ReceiveMessage"');
  // DLQとリドライブ
  assertStringIncludes(code, 'aws_sqs_queue" "jobs_queue_dlq');
  assertStringIncludes(code, 'maxReceiveCount');
});

Deno.test('EventBridge→Lambda: スケジュールルールと実行許可が生成される', () => {
  const { nodes, edges } = tpl('scheduled-batch');
  const { code, hints } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertEquals(hints, []);
  assertStringIncludes(code, 'aws_cloudwatch_event_rule');
  assertStringIncludes(code, 'schedule_expression');
  assertStringIncludes(code, 'principal     = "events.amazonaws.com"');
});

Deno.test('Step Functions→Lambda: つないだ順のワークフロー定義と呼び出し権限', () => {
  const nodes: AwsNode[] = [
    {
      id: 'sfn1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'stepfunctions', label: 'etl-flow' },
    },
    {
      id: 'fn1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'lambda', label: 'extract' },
    },
    {
      id: 'fn2',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'lambda', label: 'load' },
    },
  ];
  const edges = [
    { id: 'e1', source: 'sfn1', target: 'fn1' },
    { id: 'e2', source: 'sfn1', target: 'fn2' },
  ];
  const { code } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertStringIncludes(code, 'aws_sfn_state_machine');
  assertStringIncludes(code, 'StartAt = "Step1_extract"');
  assertStringIncludes(code, 'Next     = "Step2_load"');
  assertStringIncludes(code, '"lambda:InvokeFunction"');
});

Deno.test('CloudFront→S3: OACとバケットポリシーが生成される', () => {
  const { nodes, edges } = tpl('static-site');
  const { code, hints } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertEquals(hints, []);
  assertStringIncludes(code, 'aws_cloudfront_origin_access_control');
  assertStringIncludes(code, 'aws_cloudfront_distribution');
  assertStringIncludes(code, 'aws_s3_bucket_policy');
  assertStringIncludes(code, '"cloudfront.amazonaws.com"');
});

Deno.test('CloudFront: S3未接続ならコードを生成せずヒントを出す', () => {
  const nodes: AwsNode[] = [
    {
      id: 'cf1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'cloudfront', label: 'lonely-cdn' },
    },
  ];
  const { code, hints } = generateForEnv(nodes, [], 'dev', DEFAULT_NAMING);
  assert(!code.includes('aws_cloudfront_distribution'));
  assert(hints.some((h) => h.includes('S3')));
});

Deno.test('generateAll: 3環境分の結果を返す', () => {
  const { nodes, edges } = tpl('serverless-api');
  const all = generateAll(nodes, edges, DEFAULT_NAMING);
  assertEquals(Object.keys(all).sort(), ['dev', 'prd', 'stg']);
  assertStringIncludes(all.prd.code, '環境: PRD');
});

// ---------- 追加HCL（extraHcl） ----------

Deno.test('追加HCL: Lambdaのブロック末尾に属性行とコメントが挿入される', () => {
  const nodes: AwsNode[] = [
    {
      id: 'fn1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'lambda', label: 'my-fn', extraHcl: 'memory_size = 512' },
    },
  ];
  const { code } = generateForEnv(nodes, [], 'dev', DEFAULT_NAMING);

  const start = code.indexOf('resource "aws_lambda_function"');
  const end = code.indexOf('\n}', start);
  const block = code.slice(start, end);

  assertStringIncludes(block, '# --- 追加設定（インスペクタの「追加HCL」から挿入） ---');
  assertStringIncludes(block, '  memory_size = 512');
});

Deno.test('追加HCL: 複数行が2スペースインデントで挿入され、空行はインデントされない', () => {
  const nodes: AwsNode[] = [
    {
      id: 'fn1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: {
        serviceType: 'lambda',
        label: 'my-fn',
        extraHcl: 'memory_size = 512\n\nreserved_concurrent_executions = 5',
      },
    },
  ];
  const { code } = generateForEnv(nodes, [], 'dev', DEFAULT_NAMING);

  const start = code.indexOf('resource "aws_lambda_function"');
  const end = code.indexOf('\n}', start);
  const block = code.slice(start, end);

  assertStringIncludes(
    block,
    '  # --- 追加設定（インスペクタの「追加HCL」から挿入） ---\n  memory_size = 512\n\n  reserved_concurrent_executions = 5',
  );
});

Deno.test('追加HCL: 未指定なら従来と同一出力（既存スナップショットで担保）', () => {
  const { nodes, edges } = tpl('serverless-api');
  const { code, hints } = generateForEnv(nodes, edges, 'dev', DEFAULT_NAMING);
  assertEquals(hints, []);
  assert(!code.includes('追加設定'));
});
