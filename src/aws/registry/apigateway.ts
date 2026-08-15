import type { ServiceModule } from '../types.ts';

export const apigatewayModule: ServiceModule = {
  type: 'apigateway',
  displayName: 'API Gateway',
  category: 'ネットワーク',
  description: 'HTTPリクエストの入口',

  connectsTo: {
    lambda: 'APIへのリクエストをLambdaで処理します',
  },

  generate(node, ctx) {
    const a = ctx.name(node);
    const physical = ctx.physicalName(node);
    const lambdas = ctx.targetsOf(node, 'lambda');
    if (lambdas.length === 0) {
      ctx.hints.push(
        `API Gateway「${node.data.label}」がどのLambdaにも接続されていません。Lambdaのアイコンへ矢印でつなぐと、APIのルートが自動生成されます。`,
      );
    }

    const parts: string[] = [];
    parts.push(`
# ---------- API Gateway: ${node.data.label} ----------

resource "aws_apigatewayv2_api" "${a}" {
  name          = "${physical}"
  protocol_type = "HTTP" # シンプルで低コストなHTTP API${ctx.extraBlock(node)}
}

# $default ステージ（デプロイ先）。auto_deployで変更が即時反映される
resource "aws_apigatewayv2_stage" "${a}_default" {
  api_id      = aws_apigatewayv2_api.${a}.id
  name        = "$default"
  auto_deploy = true
}`);

    lambdas.forEach((fn) => {
      const l = ctx.name(fn);
      const routeKey =
        lambdas.length === 1 ? '$default' : `ANY /${l.replace(/_/g, '-')}/{proxy+}`;
      const routeComment =
        lambdas.length === 1
          ? '# すべてのリクエストをこのLambdaへ'
          : `# /${l.replace(/_/g, '-')}/... へのリクエストをこのLambdaへ`;
      parts.push(`
# Lambda「${fn.data.label}」との接続
resource "aws_apigatewayv2_integration" "${a}_${l}" {
  api_id                 = aws_apigatewayv2_api.${a}.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.${l}.invoke_arn
  payload_format_version = "2.0"
}

${routeComment}
resource "aws_apigatewayv2_route" "${a}_${l}" {
  api_id    = aws_apigatewayv2_api.${a}.id
  route_key = "${routeKey}"
  target    = "integrations/\${aws_apigatewayv2_integration.${a}_${l}.id}"
}

# API GatewayがこのLambdaを呼び出すことを許可
resource "aws_lambda_permission" "${a}_${l}" {
  statement_id  = "AllowInvokeFrom-${physical}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.${l}.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "\${aws_apigatewayv2_api.${a}.execution_arn}/*/*"
}`);
    });

    return parts.join('\n');
  },

  outputs(node, ctx) {
    const a = ctx.name(node);
    return `
output "${a}_endpoint" {
  description = "${node.data.label} のURL（apply後にブラウザやcurlでアクセスできます）"
  value       = aws_apigatewayv2_api.${a}.api_endpoint
}`;
  },
};
