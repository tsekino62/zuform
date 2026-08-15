import type { ServiceModule } from '../types.ts';

export const s3Module: ServiceModule = {
  type: 's3',
  displayName: 'S3',
  category: 'ストレージ',
  description: 'オブジェクトストレージ',

  generate(node, ctx) {
    const n = ctx.name(node);
    return `
# ---------- S3バケット: ${node.data.label} ----------

resource "aws_s3_bucket" "${n}" {
  # バケット名は世界中で一意にする必要があるため、prefixに乱数が付きます
  bucket_prefix = "${ctx.physicalName(node)}-"

  tags = { Name = "${ctx.physicalName(node)}" }${ctx.extraBlock(node)}
}

# 誤ってバケットを公開しないためのブロック設定（推奨）
resource "aws_s3_bucket_public_access_block" "${n}" {
  bucket = aws_s3_bucket.${n}.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
`;
  },

  outputs(node, ctx) {
    const n = ctx.name(node);
    return `
output "${n}_bucket_name" {
  description = "${node.data.label} の実際のバケット名"
  value       = aws_s3_bucket.${n}.bucket
}`;
  },
};
