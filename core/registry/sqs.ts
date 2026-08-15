import type { ServiceModule } from '../types.ts';

export const sqsModule: ServiceModule = {
  type: 'sqs',
  displayName: 'SQS',
  category: 'アプリ統合',
  description: 'メッセージキュー（非同期処理）',

  connectsTo: {
    lambda: 'キューに入ったメッセージをLambdaで処理します（イベントソース）',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const consumers = ctx.targetsOf(node, 'lambda');

    const parts: string[] = [];
    parts.push(`
# ---------- SQSキュー: ${node.data.label} ----------

# 処理に失敗し続けたメッセージの退避先（デッドレターキュー）
resource "aws_sqs_queue" "${n}_dlq" {
  name = "${physical}-dlq"

  tags = { Name = "${physical}-dlq" }
}

resource "aws_sqs_queue" "${n}" {
  name                       = "${physical}"
  visibility_timeout_seconds = 60 # 処理中のメッセージを他のワーカーから隠す時間
  receive_wait_time_seconds  = 10 # ロングポーリングで空受信のコストを削減

  # 3回受信しても処理できなければDLQへ移す
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.${n}_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}`);

    for (const fn of consumers) {
      const l = ctx.name(fn);
      parts.push(`
# キューのメッセージをLambda「${fn.data.label}」へ配信する
resource "aws_lambda_event_source_mapping" "${n}_${l}" {
  event_source_arn = aws_sqs_queue.${n}.arn
  function_name    = aws_lambda_function.${l}.arn
  batch_size       = 10 # 1回の起動でまとめて処理する件数
}`);
    }

    if (consumers.length === 0) {
      ctx.hints.push(
        `SQS「${node.data.label}」のメッセージを処理するLambdaがありません。Lambdaへ矢印でつなぐと自動でイベントソース設定が生成されます。`,
      );
    }

    return parts.join('\n');
  },
};
