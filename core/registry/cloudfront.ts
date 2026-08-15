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
        ctx.tr(
          `CloudFront「${node.data.label}」の配信元がありません。S3へ矢印でつなぐと、非公開バケットを安全に配信する設定（OAC）が生成されます。`,
          `The CloudFront distribution "${node.data.label}" has no origin. Draw an arrow to an S3 bucket and an Origin Access Control (OAC) setup for serving a private bucket securely will be generated.`,
        ),
      );
      return `
# ---------- CloudFront: ${node.data.label} ----------
${
        ctx.tr(
          `# ⚠ 配信元のS3が接続されていないため、コードを生成できませんでした。
#   S3のアイコンへ矢印でつないでください。`,
          `# WARNING: no S3 origin is connected, so no code could be generated.
#   Draw an arrow to an S3 icon.`,
        )
      }
`;
    }

    const origin = origins[0];
    const o = ctx.name(origin);
    if (origins.length > 1) {
      ctx.hints.push(
        ctx.tr(
          `CloudFront「${node.data.label}」に複数のS3がつながっています。現在は最初の1つ（${origin.data.label}）のみ配信元になります。`,
          `The CloudFront distribution "${node.data.label}" is connected to several S3 buckets. Only the first one (${origin.data.label}) is used as the origin for now.`,
        ),
      );
    }

    return `
# ---------- CloudFront: ${node.data.label} ----------

# ${
      ctx.tr(
        '非公開のS3バケットにCloudFrontだけがアクセスできるようにする仕組み（OAC）',
        'Origin Access Control (OAC): lets only CloudFront read the private S3 bucket',
      )
    }
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
  price_class         = "PriceClass_200" # ${
      ctx.tr(
        '日本を含むリージョンで配信（コスト調整可）',
        'Serves from regions including Japan (adjust to control cost)',
      )
    }

  origin {
    domain_name              = aws_s3_bucket.${o}.bucket_regional_domain_name
    origin_id                = "s3-${o}"
    origin_access_control_id = aws_cloudfront_origin_access_control.${n}.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${o}"
    viewer_protocol_policy = "redirect-to-https" # ${
      ctx.tr('httpアクセスはhttpsへ', 'Redirect http requests to https')
    }
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    # ${
      ctx.tr(
        'AWS管理のキャッシュポリシー "CachingOptimized"',
        'AWS managed cache policy "CachingOptimized"',
      )
    }
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true # ${
      ctx.tr(
        '独自ドメインを使う場合はACM証明書に変更',
        'Switch to an ACM certificate when using a custom domain',
      )
    }
  }

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}

# ${
      ctx.tr(
        'S3側: CloudFrontからのアクセスだけを許可するバケットポリシー',
        'On the S3 side: a bucket policy that allows access only from CloudFront',
      )
    }
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
  description = "${
      ctx.tr(`${node.data.label} の配信URL`, `Delivery URL of ${node.data.label}`)
    }"
  value       = "https://\${aws_cloudfront_distribution.${n}.domain_name}"
}`;
  },
};
