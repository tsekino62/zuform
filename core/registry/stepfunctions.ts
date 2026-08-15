import type { ServiceModule } from '../types.ts';

export const stepfunctionsModule: ServiceModule = {
  type: 'stepfunctions',
  displayName: 'Step Functions',
  category: 'アプリ統合',
  description: '複数ステップのワークフロー',

  connectsTo: {
    lambda: 'ワークフローのステップとしてLambdaを順番に実行します',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const steps = ctx.targetsOf(node, 'lambda');

    if (steps.length === 0) {
      ctx.hints.push(
        `Step Functions「${node.data.label}」にステップがありません。Lambdaへ矢印でつなぐと、つないだ順に実行するワークフローが生成されます。`,
      );
    }

    // 接続したLambdaを順番に実行するステートマシン定義を組み立てる
    const states: string[] = [];
    steps.forEach((fn, i) => {
      const stateName = `Step${i + 1}_${ctx.name(fn)}`;
      const next =
        i === steps.length - 1
          ? 'End      = true'
          : `Next     = "Step${i + 2}_${ctx.name(steps[i + 1])}"`;
      states.push(`      ${stateName} = {
        Type     = "Task"
        Resource = aws_lambda_function.${ctx.name(fn)}.arn
        ${next}
      }`);
    });
    const definitionBlock =
      steps.length > 0
        ? `{
    Comment = "${node.data.label}: つないだLambdaを順番に実行するワークフロー"
    StartAt = "Step1_${ctx.name(steps[0])}"
    States = {
${states.join('\n')}
    }
  }`
        : `{
    Comment = "Lambdaが接続されていないため、何もしないワークフローです"
    StartAt = "Nothing"
    States = {
      Nothing = {
        Type = "Pass"
        End  = true
      }
    }
  }`;

    const invokePolicy =
      steps.length > 0
        ? `

# ワークフローが各Lambdaを呼び出す権限
resource "aws_iam_role_policy" "${n}_invoke" {
  name = "invoke-steps"
  role = aws_iam_role.${n}_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "lambda:InvokeFunction"
      Resource = [
${steps.map((fn) => `        aws_lambda_function.${ctx.name(fn)}.arn,`).join('\n')}
      ]
    }]
  })
}`
        : '';

    return `
# ---------- Step Functions: ${node.data.label} ----------

# ステートマシンが実行時に使うIAMロール
resource "aws_iam_role" "${n}_role" {
  name = "${physical}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "states.amazonaws.com" }
    }]
  })
}${invokePolicy}

resource "aws_sfn_state_machine" "${n}" {
  name     = "${physical}"
  role_arn = aws_iam_role.${n}_role.arn

  # ワークフローの定義（つないだLambdaを上から順に実行）
  definition = jsonencode(${definitionBlock})

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}
`;
  },

  outputs(node, ctx) {
    const n = ctx.name(node);
    return `
output "${n}_arn" {
  description = "${node.data.label} のARN（AWSコンソールから実行を確認できます）"
  value       = aws_sfn_state_machine.${n}.arn
}`;
  },
};
