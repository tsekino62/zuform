import type { ServiceModule } from '../types.ts';

export const ec2Module: ServiceModule = {
  type: 'ec2',
  displayName: 'EC2',
  category: 'コンピューティング',
  description: '仮想サーバー',

  connectsTo: {
    rds: 'EC2からRDSデータベースに接続します',
  },

  generate(node, ctx) {
    const n = ctx.name(node);
    const physical = ctx.physicalName(node);
    const vpc = ctx.parentVpc(node);
    if (!vpc) {
      ctx.hints.push(
        ctx.tr(
          `EC2「${node.data.label}」はVPCの枠の中に配置するのがおすすめです（現在はデフォルトVPCに作成されます）。`,
          `We recommend placing the EC2 instance "${node.data.label}" inside a VPC boundary (it is currently created in the default VPC).`,
        ),
      );
    }
    const v = vpc ? ctx.name(vpc) : undefined;
    return `
# ---------- EC2: ${node.data.label} ----------

# ${
      ctx.tr(
        '最新の Amazon Linux 2023 のイメージを自動で取得',
        'Look up the latest Amazon Linux 2023 image automatically',
      )
    }
data "aws_ami" "${n}_al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023*-x86_64"]
  }
}

resource "aws_security_group" "${n}_sg" {
  name   = "${physical}-sg"${v ? `\n  vpc_id = aws_vpc.${v}.id` : ''}

  # ${
      ctx.tr(
        '⚠ SSH(22番)を全世界に開放しています。実運用では自分のIPに絞ってください',
        'WARNING: SSH (port 22) is open to the whole internet. Restrict it to your own IP in production',
      )
    }
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${physical}-sg" }
}

resource "aws_instance" "${n}" {
  ami           = data.aws_ami.${n}_al2023.id
  instance_type = "${ctx.profile.ec2.instanceType}"${v ? `\n  subnet_id     = aws_subnet.${v}_public_a.id` : ''}

  vpc_security_group_ids = [aws_security_group.${n}_sg.id]

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}
`;
  },

  outputs(node, ctx) {
    const n = ctx.name(node);
    return `
output "${n}_public_ip" {
  description = "${
      ctx.tr(`${node.data.label} のパブリックIPアドレス`, `Public IP address of ${node.data.label}`)
    }"
  value       = aws_instance.${n}.public_ip
}`;
  },
};
