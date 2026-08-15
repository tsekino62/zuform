import type { ServiceModule } from '../types.ts';

export const eventbridgeModule: ServiceModule = {
  type: 'eventbridge',
  displayName: 'EventBridge',
  category: 'アプリ統合',
  description: 'スケジュール実行（バッチ）',

  connectsTo: {
    lambda: '決まった時刻・間隔でLambdaを実行します（定期バッチ）',
    stepfunctions: '決まった時刻・間隔でStep Functionsのワークフローを開始します',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const lambdaTargets = ctx.targetsOf(node, 'lambda');
    const sfnTargets = ctx.targetsOf(node, 'stepfunctions');

    const parts: string[] = [];
    parts.push(`
# ---------- EventBridge スケジュール: ${node.data.label} ----------

resource "aws_cloudwatch_event_rule" "${n}" {
  name = "${physical}"

  # 実行間隔。cron式も使えます（UTC基準な点に注意）
  #   毎日 09:00 JST → cron(0 0 * * ? *)
  #   5分ごと       → rate(5 minutes)
  schedule_expression = "rate(1 day)"

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}`);

    for (const fn of lambdaTargets) {
      const l = ctx.name(fn);
      parts.push(`
# スケジュールでLambda「${fn.data.label}」を起動
resource "aws_cloudwatch_event_target" "${n}_${l}" {
  rule = aws_cloudwatch_event_rule.${n}.name
  arn  = aws_lambda_function.${l}.arn
}

# EventBridgeがこのLambdaを呼び出すことを許可
resource "aws_lambda_permission" "${n}_${l}" {
  statement_id  = "AllowInvokeFromEventBridge-${physical}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.${l}.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.${n}.arn
}`);
    }

    for (const sfn of sfnTargets) {
      const s = ctx.name(sfn);
      parts.push(`
# EventBridgeがStep Functionsを開始するためのIAMロール
resource "aws_iam_role" "${n}_${s}_role" {
  name = "${physical}-${ctx.name(sfn).replace(/_/g, '-')}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "events.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "${n}_${s}_start" {
  name = "start-execution"
  role = aws_iam_role.${n}_${s}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "states:StartExecution"
      Resource = aws_sfn_state_machine.${s}.arn
    }]
  })
}

# スケジュールでワークフロー「${sfn.data.label}」を開始
resource "aws_cloudwatch_event_target" "${n}_${s}" {
  rule     = aws_cloudwatch_event_rule.${n}.name
  arn      = aws_sfn_state_machine.${s}.arn
  role_arn = aws_iam_role.${n}_${s}_role.arn
}`);
    }

    if (lambdaTargets.length === 0 && sfnTargets.length === 0) {
      ctx.hints.push(
        `EventBridge「${node.data.label}」の実行先がありません。LambdaまたはStep Functionsへ矢印でつなぐと定期実行が設定されます。`,
      );
    }

    return parts.join('\n');
  },
};
