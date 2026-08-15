import type { ServiceModule, ServiceType } from '../types.ts';
import { apigatewayModule } from './apigateway.ts';
import { cloudfrontModule } from './cloudfront.ts';
import { vpcModule } from './vpc.ts';
import { lambdaModule } from './lambda.ts';
import { ec2Module } from './ec2.ts';
import { sqsModule } from './sqs.ts';
import { snsModule } from './sns.ts';
import { eventbridgeModule } from './eventbridge.ts';
import { stepfunctionsModule } from './stepfunctions.ts';
import { dynamodbModule } from './dynamodb.ts';
import { rdsModule } from './rds.ts';
import { s3Module } from './s3.ts';

/**
 * サービスレジストリ。
 * 新しいサービスの追加手順:
 *   1. このディレクトリに ServiceModule 実装を1ファイル追加
 *   2. 下の配列に登録（配列の順序 = パレットとコード生成の出力順）
 *   3. web/src/icons.ts にアイコンを追加
 *   4. core/generator_test.ts にテストケースを追加
 */
export const REGISTRY: ServiceModule[] = [
  apigatewayModule,
  cloudfrontModule,
  vpcModule,
  lambdaModule,
  ec2Module,
  sqsModule,
  snsModule,
  eventbridgeModule,
  stepfunctionsModule,
  dynamodbModule,
  rdsModule,
  s3Module,
];

export const MODULES: Record<ServiceType, ServiceModule> = Object.fromEntries(
  REGISTRY.map((m) => [m.type, m]),
) as Record<ServiceType, ServiceModule>;

/** 接続を許可する組み合わせ（"source->target" → 接続の意味） */
export const CONNECTION_RULES: Record<string, string> = {};
for (const m of REGISTRY) {
  for (const [target, description] of Object.entries(m.connectsTo ?? {})) {
    CONNECTION_RULES[`${m.type}->${target}`] = description;
  }
}

export function connectionKey(source: ServiceType, target: ServiceType): string {
  return `${source}->${target}`;
}
