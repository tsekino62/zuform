import type { ServiceModule } from '../types.ts';

export const lambdaModule: ServiceModule = {
  type: 'lambda',
  displayName: 'Lambda',
  category: 'コンピューティング',
  description: 'サーバーレス関数',

  connectsTo: {
    dynamodb: 'LambdaからDynamoDBテーブルを読み書きします',
    rds: 'LambdaからRDSデータベースに接続します',
    s3: 'LambdaからS3バケットを読み書きします',
    sqs: 'LambdaからSQSキューへメッセージを送信します',
    sns: 'LambdaからSNSトピックへ通知を発行します',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const vpc = ctx.lambdaVpc(node);
    const v = vpc ? ctx.name(vpc) : undefined;

    const dynamoTargets = ctx.targetsOf(node, 'dynamodb');
    const s3Targets = ctx.targetsOf(node, 's3');
    const rdsTargets = ctx.targetsOf(node, 'rds');
    const sqsTargets = ctx.targetsOf(node, 'sqs');
    const snsTargets = ctx.targetsOf(node, 'sns');
    const sqsSources = ctx.sourcesOf(node, 'sqs');

    if (vpc && !ctx.parentVpc(node)) {
      ctx.hints.push(
        `Lambda「${node.data.label}」はRDSに接続しているため、自動的にVPC「${vpc.data.label}」内で動作する設定を追加しました。図の上でもVPCの枠内に配置すると、構成がより分かりやすくなります。`,
      );
    }
    const rdsOutsideVpc = rdsTargets.filter((r) => !ctx.parentVpc(r));

    // 環境変数（接続先の情報をLambdaのコードから参照できるようにする）
    const envLines: string[] = [];
    dynamoTargets.forEach((t, i) => {
      const key = dynamoTargets.length === 1 ? 'TABLE_NAME' : `TABLE_NAME_${i + 1}`;
      envLines.push(`      ${key} = aws_dynamodb_table.${ctx.name(t)}.name`);
    });
    s3Targets.forEach((t, i) => {
      const key = s3Targets.length === 1 ? 'BUCKET_NAME' : `BUCKET_NAME_${i + 1}`;
      envLines.push(`      ${key} = aws_s3_bucket.${ctx.name(t)}.bucket`);
    });
    sqsTargets.forEach((t, i) => {
      const key = sqsTargets.length === 1 ? 'QUEUE_URL' : `QUEUE_URL_${i + 1}`;
      envLines.push(`      ${key} = aws_sqs_queue.${ctx.name(t)}.url`);
    });
    snsTargets.forEach((t, i) => {
      const key = snsTargets.length === 1 ? 'TOPIC_ARN' : `TOPIC_ARN_${i + 1}`;
      envLines.push(`      ${key} = aws_sns_topic.${ctx.name(t)}.arn`);
    });
    rdsTargets
      .filter((t) => ctx.parentVpc(t))
      .forEach((t) => {
        const tn = ctx.name(t);
        envLines.push(`      DB_HOST     = aws_db_instance.${tn}.address`);
        envLines.push(`      DB_NAME     = aws_db_instance.${tn}.db_name`);
        envLines.push(`      DB_USER     = aws_db_instance.${tn}.username`);
        envLines.push(
          `      DB_PASSWORD = var.db_password # 本番ではSecrets Managerの利用を推奨`,
        );
      });

    const parts: string[] = [];
    parts.push(`
# ---------- Lambda関数: ${node.data.label} ----------

# Lambdaが実行時に使うIAMロール（権限のセット）
resource "aws_iam_role" "${n}_role" {
  name = "${physical}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# CloudWatch Logsへログを書き込む基本権限
resource "aws_iam_role_policy_attachment" "${n}_basic" {
  role       = aws_iam_role.${n}_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}`);

    if (v) {
      parts.push(`
# VPC内で動作するための権限
resource "aws_iam_role_policy_attachment" "${n}_vpc" {
  role       = aws_iam_role.${n}_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# Lambda用のセキュリティグループ
resource "aws_security_group" "${n}_sg" {
  name   = "${physical}-sg"
  vpc_id = aws_vpc.${v}.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${physical}-sg" }
}`);
    }

    for (const t of dynamoTargets) {
      const tn = ctx.name(t);
      parts.push(`
# DynamoDBテーブル「${t.data.label}」への読み書き権限
resource "aws_iam_role_policy" "${n}_${tn}_access" {
  name = "${physical}-${tn.replace(/_/g, '-')}-access"
  role = aws_iam_role.${n}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
      ]
      Resource = aws_dynamodb_table.${tn}.arn
    }]
  })
}`);
    }

    for (const t of s3Targets) {
      const tn = ctx.name(t);
      parts.push(`
# S3バケット「${t.data.label}」への読み書き権限
resource "aws_iam_role_policy" "${n}_${tn}_access" {
  name = "${physical}-${tn.replace(/_/g, '-')}-access"
  role = aws_iam_role.${n}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
      ]
      Resource = [
        aws_s3_bucket.${tn}.arn,
        "\${aws_s3_bucket.${tn}.arn}/*",
      ]
    }]
  })
}`);
    }

    for (const t of sqsTargets) {
      const tn = ctx.name(t);
      parts.push(`
# SQSキュー「${t.data.label}」へメッセージを送る権限
resource "aws_iam_role_policy" "${n}_${tn}_send" {
  name = "${physical}-${tn.replace(/_/g, '-')}-send"
  role = aws_iam_role.${n}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sqs:SendMessage"
      Resource = aws_sqs_queue.${tn}.arn
    }]
  })
}`);
    }

    for (const t of snsTargets) {
      const tn = ctx.name(t);
      parts.push(`
# SNSトピック「${t.data.label}」へ通知を発行する権限
resource "aws_iam_role_policy" "${n}_${tn}_publish" {
  name = "${physical}-${tn.replace(/_/g, '-')}-publish"
  role = aws_iam_role.${n}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "sns:Publish"
      Resource = aws_sns_topic.${tn}.arn
    }]
  })
}`);
    }

    for (const t of sqsSources) {
      const tn = ctx.name(t);
      parts.push(`
# SQSキュー「${t.data.label}」からメッセージを受け取る権限（イベントソース用）
resource "aws_iam_role_policy" "${n}_${tn}_consume" {
  name = "${physical}-${tn.replace(/_/g, '-')}-consume"
  role = aws_iam_role.${n}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes",
      ]
      Resource = aws_sqs_queue.${tn}.arn
    }]
  })
}`);
    }

    const envBlock =
      envLines.length > 0
        ? `

  # 接続先の情報を環境変数としてLambdaのコードに渡す
  environment {
    variables = {
${envLines.join('\n')}
    }
  }`
        : '';

    const vpcBlock = v
      ? `

  # VPC内のリソース（RDSなど）へアクセスするための設定
  vpc_config {
    subnet_ids         = [aws_subnet.${v}_private_a.id, aws_subnet.${v}_private_c.id]
    security_group_ids = [aws_security_group.${n}_sg.id]
  }`
      : '';

    parts.push(`
resource "aws_lambda_function" "${n}" {
  function_name = "${physical}"
  role          = aws_iam_role.${n}_role.arn

  runtime = "python3.12"
  handler = "index.lambda_handler" # index.py の lambda_handler 関数を実行

  # ここにデプロイパッケージ(zip)を配置してください。
  # 例: mkdir -p build && cd src && zip -r ../build/${n}.zip .
  filename = "build/${n}.zip"

  timeout = 10${envBlock}${vpcBlock}${ctx.extraBlock(node)}
}`);

    if (rdsOutsideVpc.length > 0) {
      parts.push(`
# ⚠ 接続先のRDS（${rdsOutsideVpc.map((r) => r.data.label).join(', ')}）がVPC外に
#   配置されているため、RDSへの接続設定は生成されていません。
`);
    }

    return parts.join('\n');
  },
};
