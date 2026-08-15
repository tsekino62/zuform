import type { ServiceModule } from '../types.ts';

export const dynamodbModule: ServiceModule = {
  type: 'dynamodb',
  displayName: 'DynamoDB',
  category: 'データベース',
  description: 'NoSQLデータベース',

  generate(node, ctx) {
    const n = ctx.name(node);
    return `
# ---------- DynamoDBテーブル: ${node.data.label} ----------

resource "aws_dynamodb_table" "${n}" {
  name         = "${ctx.physicalName(node)}"
  billing_mode = "PAY_PER_REQUEST" # 使った分だけ課金（初心者におすすめ）
  hash_key     = "id"              # 主キー。必要に応じて変更してください

  attribute {
    name = "id"
    type = "S" # S = 文字列型
  }

  tags = { Name = "${ctx.physicalName(node)}" }${ctx.extraBlock(node)}
}
`;
  },
};
