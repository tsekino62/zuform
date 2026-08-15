import type { ServiceModule } from '../types.ts';

export const dynamodbModule: ServiceModule = {
  type: 'dynamodb',
  displayName: 'DynamoDB',
  category: 'データベース',
  description: 'NoSQLデータベース',

  generate(node, ctx) {
    const n = ctx.name(node);
    return `
# ---------- ${
      ctx.tr(`DynamoDBテーブル: ${node.data.label}`, `DynamoDB table: ${node.data.label}`)
    } ----------

resource "aws_dynamodb_table" "${n}" {
  name         = "${ctx.physicalName(node)}"
  billing_mode = "PAY_PER_REQUEST" # ${
      ctx.tr(
        '使った分だけ課金（初心者におすすめ）',
        'Pay only for what you use (recommended for beginners)',
      )
    }
  hash_key     = "id"              # ${
      ctx.tr('主キー。必要に応じて変更してください', 'Partition key. Change it if you need to')
    }

  attribute {
    name = "id"
    type = "S" # ${ctx.tr('S = 文字列型', 'S = string type')}
  }

  tags = { Name = "${ctx.physicalName(node)}" }${ctx.extraBlock(node)}
}
`;
  },
};
