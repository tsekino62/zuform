import type { ServiceModule } from '../types.ts';

export const snsModule: ServiceModule = {
  type: 'sns',
  displayName: 'SNS',
  category: 'アプリ統合',
  description: '通知・ファンアウト配信',

  connectsTo: {
    lambda: 'トピックへの通知をLambdaで受け取ります（サブスクリプション）',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const subscribers = ctx.targetsOf(node, 'lambda');

    const parts: string[] = [];
    parts.push(`
# ---------- SNSトピック: ${node.data.label} ----------

resource "aws_sns_topic" "${n}" {
  name = "${physical}"

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}`);

    for (const fn of subscribers) {
      const l = ctx.name(fn);
      parts.push(`
# トピックの通知をLambda「${fn.data.label}」が受け取る
resource "aws_sns_topic_subscription" "${n}_${l}" {
  topic_arn = aws_sns_topic.${n}.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.${l}.arn
}

# SNSがこのLambdaを呼び出すことを許可
resource "aws_lambda_permission" "${n}_${l}" {
  statement_id  = "AllowInvokeFromSNS-${physical}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.${l}.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.${n}.arn
}`);
    }

    if (subscribers.length === 0) {
      ctx.hints.push(
        `SNS「${node.data.label}」の通知先がありません。Lambdaへ矢印でつなぐとサブスクリプションが生成されます（メール通知などは生成後にコードへ追記できます）。`,
      );
    }

    return parts.join('\n');
  },
};
