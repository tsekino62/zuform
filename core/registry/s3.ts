import type { ServiceModule } from '../types.ts';

export const s3Module: ServiceModule = {
  type: 's3',
  displayName: 'S3',
  category: 'ストレージ',
  description: 'オブジェクトストレージ',

  generate(node, ctx) {
    const n = ctx.name(node);
    return `
# ---------- ${
      ctx.tr(`S3バケット: ${node.data.label}`, `S3 bucket: ${node.data.label}`)
    } ----------

resource "aws_s3_bucket" "${n}" {
  # ${
      ctx.tr(
        'バケット名は世界中で一意にする必要があるため、prefixに乱数が付きます',
        'Bucket names must be globally unique, so a random suffix is added to this prefix',
      )
    }
  bucket_prefix = "${ctx.physicalName(node)}-"

  tags = { Name = "${ctx.physicalName(node)}" }${ctx.extraBlock(node)}
}

# ${
      ctx.tr(
        '誤ってバケットを公開しないためのブロック設定（推奨）',
        'Block settings that prevent the bucket from being made public by mistake (recommended)',
      )
    }
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
  description = "${
      ctx.tr(`${node.data.label} の実際のバケット名`, `Actual bucket name of ${node.data.label}`)
    }"
  value       = aws_s3_bucket.${n}.bucket
}`;
  },
};
