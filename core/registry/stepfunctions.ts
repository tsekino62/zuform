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
        ctx.tr(
          `Step Functions「${node.data.label}」にステップがありません。Lambdaへ矢印でつなぐと、つないだ順に実行するワークフローが生成されます。`,
          `The Step Functions workflow "${node.data.label}" has no steps. Draw arrows to Lambdas and a workflow that runs them in the order you connected them will be generated.`,
        ),
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
    Comment = "${
          ctx.tr(
            `${node.data.label}: つないだLambdaを順番に実行するワークフロー`,
            `${node.data.label}: workflow that runs the connected Lambdas in order`,
          )
        }"
    StartAt = "Step1_${ctx.name(steps[0])}"
    States = {
${states.join('\n')}
    }
  }`
        : `{
    Comment = "${
          ctx.tr(
            'Lambdaが接続されていないため、何もしないワークフローです',
            'No Lambda is connected, so this workflow does nothing',
          )
        }"
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

# ${
      ctx.tr(
        'ワークフローが各Lambdaを呼び出す権限',
        'Permission for the workflow to invoke each Lambda',
      )
    }
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

# ${
      ctx.tr(
        'ステートマシンが実行時に使うIAMロール',
        'IAM role the state machine assumes at runtime',
      )
    }
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

  # ${
      ctx.tr(
        'ワークフローの定義（つないだLambdaを上から順に実行）',
        'Workflow definition (runs the connected Lambdas from top to bottom)',
      )
    }
  definition = jsonencode(${definitionBlock})

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}
`;
  },

  outputs(node, ctx) {
    const n = ctx.name(node);
    return `
output "${n}_arn" {
  description = "${
      ctx.tr(
        `${node.data.label} のARN（AWSコンソールから実行を確認できます）`,
        `ARN of ${node.data.label} (you can watch executions in the AWS console)`,
      )
    }"
  value       = aws_sfn_state_machine.${n}.arn
}`;
  },
};
