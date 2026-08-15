import type { Edge } from '@xyflow/react';
import type { AwsNode, ServiceType } from './types.ts';

export interface DiagramTemplate {
  id: string;
  title: string;
  /** 用途カテゴリ（ギャラリーの絞り込みに使用） */
  useCase: string;
  level: '入門' | '基本';
  description: string;
  /** ギャラリーカードに並べるサービスアイコン */
  services: ServiceType[];
  nodes: AwsNode[];
  edges: Edge[];
}

export const USE_CASES = [
  'API開発',
  'バッチ/定期実行',
  '静的サイト配信',
  'ファイル保存',
  'Webサーバー',
] as const;

export const TEMPLATES: DiagramTemplate[] = [
  {
    id: 'serverless-api',
    title: 'サーバーレスAPI',
    useCase: 'API開発',
    level: '入門',
    description:
      'API Gateway + Lambda + DynamoDB。サーバー管理が不要で、使った分だけ課金される最小構成のREST APIです。まずはここから始めるのがおすすめ。',
    services: ['apigateway', 'lambda', 'dynamodb'],
    nodes: [
      {
        id: 'tpl-sa-api',
        type: 'aws',
        position: { x: 80, y: 200 },
        data: { serviceType: 'apigateway', label: 'items-api' },
      },
      {
        id: 'tpl-sa-fn',
        type: 'aws',
        position: { x: 340, y: 200 },
        data: { serviceType: 'lambda', label: 'items-handler' },
      },
      {
        id: 'tpl-sa-db',
        type: 'aws',
        position: { x: 600, y: 200 },
        data: { serviceType: 'dynamodb', label: 'items-table' },
      },
    ],
    edges: [
      { id: 'tpl-sa-e1', source: 'tpl-sa-api', target: 'tpl-sa-fn' },
      { id: 'tpl-sa-e2', source: 'tpl-sa-fn', target: 'tpl-sa-db' },
    ],
  },
  {
    id: 'web-db-api',
    title: 'RDBを使うWeb API',
    useCase: 'API開発',
    level: '基本',
    description:
      'API Gateway + Lambda + RDS (MySQL)。リレーショナルDBが必要なAPI向け。RDSはVPC内に配置され、LambdaにはVPC設定とセキュリティグループが自動生成されます。',
    services: ['apigateway', 'lambda', 'rds', 'vpc'],
    nodes: [
      {
        id: 'tpl-wd-vpc',
        type: 'vpc',
        position: { x: 360, y: 80 },
        style: { width: 560, height: 340 },
        data: { serviceType: 'vpc', label: 'app-vpc' },
      },
      {
        id: 'tpl-wd-api',
        type: 'aws',
        position: { x: 80, y: 210 },
        data: { serviceType: 'apigateway', label: 'user-api' },
      },
      {
        id: 'tpl-wd-fn',
        type: 'aws',
        position: { x: 90, y: 120 },
        parentId: 'tpl-wd-vpc',
        data: { serviceType: 'lambda', label: 'get-users' },
      },
      {
        id: 'tpl-wd-db',
        type: 'aws',
        position: { x: 340, y: 120 },
        parentId: 'tpl-wd-vpc',
        data: { serviceType: 'rds', label: 'users-db' },
      },
    ],
    edges: [
      { id: 'tpl-wd-e1', source: 'tpl-wd-api', target: 'tpl-wd-fn' },
      { id: 'tpl-wd-e2', source: 'tpl-wd-fn', target: 'tpl-wd-db' },
    ],
  },
  {
    id: 'file-upload',
    title: 'ファイルアップロードAPI',
    useCase: 'ファイル保存',
    level: '基本',
    description:
      'API Gateway + Lambda + S3 + DynamoDB。ファイル本体はS3に、メタデータ（ファイル名や作成日時）はDynamoDBに保存する定番パターンです。',
    services: ['apigateway', 'lambda', 's3', 'dynamodb'],
    nodes: [
      {
        id: 'tpl-fu-api',
        type: 'aws',
        position: { x: 80, y: 240 },
        data: { serviceType: 'apigateway', label: 'upload-api' },
      },
      {
        id: 'tpl-fu-fn',
        type: 'aws',
        position: { x: 340, y: 240 },
        data: { serviceType: 'lambda', label: 'upload-handler' },
      },
      {
        id: 'tpl-fu-s3',
        type: 'aws',
        position: { x: 600, y: 140 },
        data: { serviceType: 's3', label: 'uploads' },
      },
      {
        id: 'tpl-fu-meta',
        type: 'aws',
        position: { x: 600, y: 340 },
        data: { serviceType: 'dynamodb', label: 'files-meta' },
      },
    ],
    edges: [
      { id: 'tpl-fu-e1', source: 'tpl-fu-api', target: 'tpl-fu-fn' },
      { id: 'tpl-fu-e2', source: 'tpl-fu-fn', target: 'tpl-fu-s3' },
      { id: 'tpl-fu-e3', source: 'tpl-fu-fn', target: 'tpl-fu-meta' },
    ],
  },
  {
    id: 'ec2-web',
    title: 'EC2 Webサーバー + RDS',
    useCase: 'Webサーバー',
    level: '基本',
    description:
      'VPC内にEC2の仮想サーバーとRDSを配置する伝統的な構成。WordPressのようなサーバー常駐型のアプリに向いています。',
    services: ['ec2', 'rds', 'vpc'],
    nodes: [
      {
        id: 'tpl-ew-vpc',
        type: 'vpc',
        position: { x: 240, y: 80 },
        style: { width: 560, height: 340 },
        data: { serviceType: 'vpc', label: 'web-vpc' },
      },
      {
        id: 'tpl-ew-ec2',
        type: 'aws',
        position: { x: 90, y: 120 },
        parentId: 'tpl-ew-vpc',
        data: { serviceType: 'ec2', label: 'web-server' },
      },
      {
        id: 'tpl-ew-db',
        type: 'aws',
        position: { x: 340, y: 120 },
        parentId: 'tpl-ew-vpc',
        data: { serviceType: 'rds', label: 'app-db' },
      },
    ],
    edges: [{ id: 'tpl-ew-e1', source: 'tpl-ew-ec2', target: 'tpl-ew-db' }],
  },
  {
    id: 'scheduled-batch',
    title: '定期バッチ',
    useCase: 'バッチ/定期実行',
    level: '入門',
    description:
      'EventBridge + Lambda + DynamoDB。毎日決まった時刻や一定間隔でLambdaを実行する定期バッチの最小構成です。実行間隔は生成コードのcron式で調整できます。',
    services: ['eventbridge', 'lambda', 'dynamodb'],
    nodes: [
      {
        id: 'tpl-sb-ev',
        type: 'aws',
        position: { x: 80, y: 200 },
        data: { serviceType: 'eventbridge', label: 'daily-schedule' },
      },
      {
        id: 'tpl-sb-fn',
        type: 'aws',
        position: { x: 340, y: 200 },
        data: { serviceType: 'lambda', label: 'batch-job' },
      },
      {
        id: 'tpl-sb-db',
        type: 'aws',
        position: { x: 600, y: 200 },
        data: { serviceType: 'dynamodb', label: 'batch-results' },
      },
    ],
    edges: [
      { id: 'tpl-sb-e1', source: 'tpl-sb-ev', target: 'tpl-sb-fn' },
      { id: 'tpl-sb-e2', source: 'tpl-sb-fn', target: 'tpl-sb-db' },
    ],
  },
  {
    id: 'async-worker',
    title: '非同期ワーカー（SQS）',
    useCase: 'バッチ/定期実行',
    level: '基本',
    description:
      'API Gateway + Lambda + SQS + ワーカーLambda。重い処理をキューに逃がして即レスポンスを返す非同期パターン。失敗したメッセージはDLQに退避されます。',
    services: ['apigateway', 'lambda', 'sqs', 'dynamodb'],
    nodes: [
      {
        id: 'tpl-aw-api',
        type: 'aws',
        position: { x: 60, y: 200 },
        data: { serviceType: 'apigateway', label: 'jobs-api' },
      },
      {
        id: 'tpl-aw-fn1',
        type: 'aws',
        position: { x: 300, y: 200 },
        data: { serviceType: 'lambda', label: 'enqueue-job' },
      },
      {
        id: 'tpl-aw-q',
        type: 'aws',
        position: { x: 540, y: 200 },
        data: { serviceType: 'sqs', label: 'jobs-queue' },
      },
      {
        id: 'tpl-aw-fn2',
        type: 'aws',
        position: { x: 780, y: 200 },
        data: { serviceType: 'lambda', label: 'job-worker' },
      },
      {
        id: 'tpl-aw-db',
        type: 'aws',
        position: { x: 1020, y: 200 },
        data: { serviceType: 'dynamodb', label: 'jobs-table' },
      },
    ],
    edges: [
      { id: 'tpl-aw-e1', source: 'tpl-aw-api', target: 'tpl-aw-fn1' },
      { id: 'tpl-aw-e2', source: 'tpl-aw-fn1', target: 'tpl-aw-q' },
      { id: 'tpl-aw-e3', source: 'tpl-aw-q', target: 'tpl-aw-fn2' },
      { id: 'tpl-aw-e4', source: 'tpl-aw-fn2', target: 'tpl-aw-db' },
    ],
  },
  {
    id: 'static-site',
    title: '静的サイト配信',
    useCase: '静的サイト配信',
    level: '入門',
    description:
      'CloudFront + S3。非公開のS3バケットに置いたHTML/CSS/JSを、CDN経由でhttps配信します。バケットへの直接アクセスはOACでブロックされます。',
    services: ['cloudfront', 's3'],
    nodes: [
      {
        id: 'tpl-ss-cf',
        type: 'aws',
        position: { x: 120, y: 200 },
        data: { serviceType: 'cloudfront', label: 'site-cdn' },
      },
      {
        id: 'tpl-ss-s3',
        type: 'aws',
        position: { x: 400, y: 200 },
        data: { serviceType: 's3', label: 'site-assets' },
      },
    ],
    edges: [{ id: 'tpl-ss-e1', source: 'tpl-ss-cf', target: 'tpl-ss-s3' }],
  },
];
