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
  description = "RDSデータベースの管理者パスワード（terraform apply時に入力）"
  type        = string
  sensitive   = true # 実行ログに表示されないようにする
}
`;
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const vpc = ctx.parentVpc(node);
    if (!vpc) {
      ctx.hints.push(
        `RDS「${node.data.label}」がVPCの枠の外にあります。RDSはVPC内に配置する必要があるため、VPCの枠内にドラッグしてください（コードは生成されていません）。`,
      );
      return `
# ---------- RDS: ${node.data.label} ----------
# ⚠ このRDSはVPCの枠の外に配置されているため、コードを生成できませんでした。
#   キャンバス上でRDSのアイコンをVPCの枠の中にドラッグしてください。
`;
    }
    const v = ctx.name(vpc);
    const p = ctx.profile.rds;

    // 接続元（Lambda / EC2）のセキュリティグループから3306番ポートを許可する
    const ingressBlocks: string[] = [];
    for (const src of ctx.sourcesOf(node, 'lambda')) {
      ingressBlocks.push(`
  # Lambda「${src.data.label}」からの接続を許可
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.${ctx.name(src)}_sg.id]
  }`);
    }
    for (const src of ctx.sourcesOf(node, 'ec2')) {
      ingressBlocks.push(`
  # EC2「${src.data.label}」からの接続を許可
  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.${ctx.name(src)}_sg.id]
  }`);
    }
    if (ingressBlocks.length === 0) {
      ctx.hints.push(
        `RDS「${node.data.label}」に接続しているリソースがありません。LambdaやEC2から矢印でつなぐと、接続許可（セキュリティグループ）が自動生成されます。`,
      );
    }

    return `
# ---------- RDS (MySQL): ${node.data.label} ----------

# DBを配置するサブネットのグループ（2つ以上のAZが必要）
resource "aws_db_subnet_group" "${n}" {
  name       = "${physical}-subnets"
  subnet_ids = [aws_subnet.${v}_private_a.id, aws_subnet.${v}_private_c.id]

  tags = { Name = "${physical}-subnets" }
}

# DBへの通信を制御するファイアウォール
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
  allocated_storage = 20 # ストレージ 20GB

  db_name  = "app"
  username = "admin"
  password = var.db_password

  db_subnet_group_name   = aws_db_subnet_group.${n}.name
  vpc_security_group_ids = [aws_security_group.${n}_sg.id]

  multi_az                = ${p.multiAz} # ${p.multiAz ? '2つのAZに冗長化（本番向け）' : '単一AZ（コスト優先）'}
  backup_retention_period = ${p.backupRetentionDays} # 自動バックアップの保持日数
  deletion_protection     = ${p.deletionProtection} # ${p.deletionProtection ? '誤削除を防止' : '削除保護なし（検証用）'}
  skip_final_snapshot     = ${p.skipFinalSnapshot} # ${p.skipFinalSnapshot ? '削除時のスナップショットを省略（検証用）' : '削除時に最終スナップショットを取得'}

  publicly_accessible = false # インターネットから直接アクセスさせない${ctx.extraBlock(node)}
}
`;
  },

  outputs(node, ctx) {
    if (!ctx.parentVpc(node)) return '';
    const n = ctx.name(node);
    return `
output "${n}_endpoint" {
  description = "${node.data.label} の接続先ホスト名"
  value       = aws_db_instance.${n}.address
}`;
  },
};
