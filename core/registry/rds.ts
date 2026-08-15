import type { ServiceModule } from '../types.ts';

export const rdsModule: ServiceModule = {
  type: 'rds',
  displayName: 'RDS',
  category: 'データベース',
  description: 'リレーショナルDB（VPC内に配置）',

  variables(ctx) {
    // VPC内に配置されたRDSがある環境でのみ出力される
    const hasUsableRds = ctx
      .byType('rds')
      .some((r) => ctx.parentVpc(r) !== undefined);
    if (!hasUsableRds) return '';
    return `
variable "db_password" {
  description = "${
      ctx.tr(
        'RDSデータベースの管理者パスワード（terraform apply時に入力）',
        'Master password for the RDS database (entered at terraform apply time)',
      )
    }"
  type        = string
  sensitive   = true # ${
      ctx.tr('実行ログに表示されないようにする', 'Keeps the value out of the execution log')
    }
}
`;
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const vpc = ctx.parentVpc(node);
    if (!vpc) {
      ctx.hints.push(
        ctx.tr(
          `RDS「${node.data.label}」がVPCの枠の外にあります。RDSはVPC内に配置する必要があるため、VPCの枠内にドラッグしてください（コードは生成されていません）。`,
          `The RDS instance "${node.data.label}" sits outside the VPC boundary. RDS must live inside a VPC, so drag it into the VPC boundary (no code was generated).`,
        ),
      );
      return `
# ---------- RDS: ${node.data.label} ----------
${
        ctx.tr(
          `# ⚠ このRDSはVPCの枠の外に配置されているため、コードを生成できませんでした。
#   キャンバス上でRDSのアイコンをVPCの枠の中にドラッグしてください。`,
          `# WARNING: this RDS instance is outside the VPC boundary, so no code could be generated.
#   Drag the RDS icon into the VPC boundary on the canvas.`,
        )
      }
`;
    }
    const v = ctx.name(vpc);
    const p = ctx.profile.rds;

    // 接続元（Lambda / EC2）のセキュリティグループから3306番ポートを許可する
    const ingressBlocks: string[] = [];
    for (const src of ctx.sourcesOf(node, 'lambda')) {
      ingressBlocks.push(`
  # ${
        ctx.tr(
          `Lambda「${src.data.label}」からの接続を許可`,
          `Allow connections from the Lambda "${src.data.label}"`,
        )
      }
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.${ctx.name(src)}_sg.id]
  }`);
    }
    for (const src of ctx.sourcesOf(node, 'ec2')) {
      ingressBlocks.push(`
  # ${
        ctx.tr(
          `EC2「${src.data.label}」からの接続を許可`,
          `Allow connections from the EC2 instance "${src.data.label}"`,
        )
      }
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.${ctx.name(src)}_sg.id]
  }`);
    }
    if (ingressBlocks.length === 0) {
      ctx.hints.push(
        ctx.tr(
          `RDS「${node.data.label}」に接続しているリソースがありません。LambdaやEC2から矢印でつなぐと、接続許可（セキュリティグループ）が自動生成されます。`,
          `Nothing connects to the RDS instance "${node.data.label}". Draw an arrow from a Lambda or EC2 instance and the security group rules will be generated for you.`,
        ),
      );
    }

    return `
# ---------- RDS (MySQL): ${node.data.label} ----------

# ${
      ctx.tr(
        'DBを配置するサブネットのグループ（2つ以上のAZが必要）',
        'Subnet group the DB is placed in (requires at least two AZs)',
      )
    }
resource "aws_db_subnet_group" "${n}" {
  name       = "${physical}-subnets"
  subnet_ids = [aws_subnet.${v}_private_a.id, aws_subnet.${v}_private_c.id]

  tags = { Name = "${physical}-subnets" }
}

# ${
      ctx.tr('DBへの通信を制御するファイアウォール', 'Firewall that controls traffic to the DB')
    }
resource "aws_security_group" "${n}_sg" {
  name   = "${physical}-sg"
  vpc_id = aws_vpc.${v}.id
${ingressBlocks.join('\n')}

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${physical}-sg" }
}

resource "aws_db_instance" "${n}" {
  identifier        = "${physical}"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = "${p.instanceClass}"
  allocated_storage = 20 # ${ctx.tr('ストレージ 20GB', '20 GB of storage')}

  db_name  = "app"
  username = "admin"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.${n}.name
  vpc_security_group_ids = [aws_security_group.${n}_sg.id]

  multi_az                = ${p.multiAz} # ${
      p.multiAz
        ? ctx.tr('2つのAZに冗長化（本番向け）', 'Replicated across two AZs (for production)')
        : ctx.tr('単一AZ（コスト優先）', 'Single AZ (lower cost)')
    }
  backup_retention_period = ${p.backupRetentionDays} # ${
      ctx.tr('自動バックアップの保持日数', 'Retention period of automated backups, in days')
    }
  deletion_protection     = ${p.deletionProtection} # ${
      p.deletionProtection
        ? ctx.tr('誤削除を防止', 'Guards against accidental deletion')
        : ctx.tr('削除保護なし（検証用）', 'No deletion protection (for testing)')
    }
  skip_final_snapshot     = ${p.skipFinalSnapshot} # ${
      p.skipFinalSnapshot
        ? ctx.tr(
          '削除時のスナップショットを省略（検証用）',
          'Skips the snapshot on deletion (for testing)',
        )
        : ctx.tr(
          '削除時に最終スナップショットを取得',
          'Takes a final snapshot on deletion',
        )
    }

  publicly_accessible = false # ${
      ctx.tr(
        'インターネットから直接アクセスさせない',
        'Not reachable directly from the internet',
      )
    }${ctx.extraBlock(node)}
}
`;
  },

  outputs(node, ctx) {
    if (!ctx.parentVpc(node)) return '';
    const n = ctx.name(node);
    return `
output "${n}_endpoint" {
  description = "${
      ctx.tr(`${node.data.label} の接続先ホスト名`, `Connection host name of ${node.data.label}`)
    }"
  value       = aws_db_instance.${n}.address
}`;
  },
};
