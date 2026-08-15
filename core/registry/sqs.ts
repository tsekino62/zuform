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
# ---------- ${
      ctx.tr(`SQSキュー: ${node.data.label}`, `SQS queue: ${node.data.label}`)
    } ----------

# ${
      ctx.tr(
        '処理に失敗し続けたメッセージの退避先（デッドレターキュー）',
        'Dead letter queue: where messages that keep failing end up',
      )
    }
resource "aws_sqs_queue" "${n}_dlq" {
  name = "${physical}-dlq"

  tags = { Name = "${physical}-dlq" }
}

resource "aws_sqs_queue" "${n}" {
  name                       = "${physical}"
  visibility_timeout_seconds = 60 # ${
      ctx.tr(
        '処理中のメッセージを他のワーカーから隠す時間',
        'How long an in-flight message stays hidden from other workers',
      )
    }
  receive_wait_time_seconds  = 10 # ${
      ctx.tr(
        'ロングポーリングで空受信のコストを削減',
        'Long polling reduces the cost of empty receives',
      )
    }

  # ${
      ctx.tr(
        '3回受信しても処理できなければDLQへ移す',
        'Move a message to the DLQ if it is received 3 times without being processed',
      )
    }
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.${n}_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}`);

    for (const fn of consumers) {
      const l = ctx.name(fn);
      parts.push(`
# ${
        ctx.tr(
          `キューのメッセージをLambda「${fn.data.label}」へ配信する`,
          `Deliver queue messages to the Lambda "${fn.data.label}"`,
        )
      }
resource "aws_lambda_event_source_mapping" "${n}_${l}" {
  event_source_arn = aws_sqs_queue.${n}.arn
  function_name    = aws_lambda_function.${l}.arn
  batch_size       = 10 # ${
        ctx.tr('1回の起動でまとめて処理する件数', 'Number of messages processed per invocation')
      }
}`);
    }

    if (consumers.length === 0) {
      ctx.hints.push(
        ctx.tr(
          `SQS「${node.data.label}」のメッセージを処理するLambdaがありません。Lambdaへ矢印でつなぐと自動でイベントソース設定が生成されます。`,
          `No Lambda processes the messages in the SQS queue "${node.data.label}". Draw an arrow to a Lambda and the event source mapping will be generated for you.`,
        ),
      );
    }

    return parts.join('\n');
  },
};
