import type { ServiceModule } from '../types.ts';

export const cloudfrontModule: ServiceModule = {
  type: 'cloudfront',
  displayName: 'CloudFront',
  category: 'ネットワーク',
  description: 'CDN（静的サイト配信）',

  connectsTo: {
    s3: 'S3の中身をCDN経由で世界中に高速配信します（静的サイト）',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const origins = ctx.targetsOf(node, 's3');

    if (origins.length === 0) {
      ctx.hints.push(
        `CloudFront「${node.data.label}」の配信元がありません。S3へ矢印でつなぐと、非公開バケットを安全に配信する設定（OAC）が生成されます。`,
      );
      return `
# ---------- CloudFront: ${node.data.label} ----------
# ⚠ 配信元のS3が接続されていないため、コードを生成できませんでした。
#   S3のアイコンへ矢印でつないでください。
`;
    }

    const origin = origins[0];
    const o = ctx.name(origin);
    if (origins.length > 1) {
      ctx.hints.push(
        `CloudFront「${node.data.label}」に複数のS3がつながっています。現在は最初の1つ（${origin.data.label}）のみ配信元になります。`,
      );
    }

    return `
# ---------- CloudFront: ${node.data.label} ----------

# 非公開のS3バケットにCloudFrontだけがアクセスできるようにする仕組み（OAC）
resource "aws_cloudfront_origin_access_control" "${n}" {
  name                              = "${physical}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "${n}" {
  enabled             = true
  comment             = "${node.data.label}"
  default_root_object = "index.html"
  price_class         = "PriceClass_200" # 日本を含むリージョンで配信（コスト調整可）

  origin {
    domain_name              = aws_s3_bucket.${o}.bucket_regional_domain_name
    origin_id                = "s3-${o}"
    origin_access_control_id = aws_cloudfront_origin_access_control.${n}.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${o}"
    viewer_protocol_policy = "redirect-to-https" # httpアクセスはhttpsへ
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    # AWS管理のキャッシュポリシー "CachingOptimized"
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true # 独自ドメインを使う場合はACM証明書に変更
  }

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}

# S3側: CloudFrontからのアクセスだけを許可するバケットポリシー
resource "aws_s3_bucket_policy" "${o}_from_${n}" {
  bucket = aws_s3_bucket.${o}.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "\${aws_s3_bucket.${o}.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.${n}.arn
        }
      }
    }]
  })
}
`;
  },

  outputs(node, ctx) {
    if (ctx.targetsOf(node, 's3').length === 0) return '';
    const n = ctx.name(node);
    return `
output "${n}_url" {
  description = "${node.data.label} の配信URL"
  value       = "https://\${aws_cloudfront_distribution.${n}.domain_name}"
}`;
  },
};
