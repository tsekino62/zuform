import type { ServiceModule } from '../types.ts';

export const vpcModule: ServiceModule = {
  type: 'vpc',
  displayName: 'VPC',
  category: 'ネットワーク',
  description: 'プライベートネットワークの枠',
  isGroup: true,

  generate(node, ctx) {
    const v = ctx.name(node);
    const index = ctx.byType('vpc').indexOf(node);
    const cidr = `10.${index}`;
    const physical = ctx.physicalName(node);
    return `
# ---------- VPC: ${node.data.label} ----------

resource "aws_vpc" "${v}" {
  cidr_block           = "${cidr}.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${physical}" }${ctx.extraBlock(node)}
}

# ${ctx.tr('インターネットへの出入口', 'Gateway to and from the internet')}
resource "aws_internet_gateway" "${v}_igw" {
  vpc_id = aws_vpc.${v}.id

  tags = { Name = "${physical}-igw" }
}

# ${
      ctx.tr(
        'パブリックサブネット（インターネットから到達可能）',
        'Public subnet (reachable from the internet)',
      )
    }
resource "aws_subnet" "${v}_public_a" {
  vpc_id                  = aws_vpc.${v}.id
  cidr_block              = "${cidr}.0.0/24"
  availability_zone       = "\${var.region}a"
  map_public_ip_on_launch = true

  tags = { Name = "${physical}-public-a" }
}

# ${
      ctx.tr(
        'プライベートサブネット（DBなど外部公開しないリソース用・2AZ分）',
        'Private subnets across two AZs, for resources that stay off the internet (DBs, etc.)',
      )
    }
resource "aws_subnet" "${v}_private_a" {
  vpc_id            = aws_vpc.${v}.id
  cidr_block        = "${cidr}.10.0/24"
  availability_zone = "\${var.region}a"

  tags = { Name = "${physical}-private-a" }
}

resource "aws_subnet" "${v}_private_c" {
  vpc_id            = aws_vpc.${v}.id
  cidr_block        = "${cidr}.11.0/24"
  availability_zone = "\${var.region}c"

  tags = { Name = "${physical}-private-c" }
}

# ${ctx.tr('パブリックサブネット用のルートテーブル', 'Route table for the public subnet')}
resource "aws_route_table" "${v}_public" {
  vpc_id = aws_vpc.${v}.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.${v}_igw.id
  }

  tags = { Name = "${physical}-public-rt" }
}

resource "aws_route_table_association" "${v}_public_a" {
  subnet_id      = aws_subnet.${v}_public_a.id
  route_table_id = aws_route_table.${v}_public.id
}
`;
  },
};
