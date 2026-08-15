// AWS公式 Architecture Icons（./assets/aws-icons/NOTICE.md を参照）
// UI専用モジュール。コード生成ロジック（registry/）からは import しないこと
// （deno test はSVGを読み込めないため、レジストリは純粋なTSに保つ）。
import apigatewayIcon from './assets/aws-icons/apigateway.svg';
import lambdaIcon from './assets/aws-icons/lambda.svg';
import ec2Icon from './assets/aws-icons/ec2.svg';
import rdsIcon from './assets/aws-icons/rds.svg';
import dynamodbIcon from './assets/aws-icons/dynamodb.svg';
import s3Icon from './assets/aws-icons/s3.svg';
import sqsIcon from './assets/aws-icons/sqs.svg';
import snsIcon from './assets/aws-icons/sns.svg';
import eventbridgeIcon from './assets/aws-icons/eventbridge.svg';
import stepfunctionsIcon from './assets/aws-icons/stepfunctions.svg';
import cloudfrontIcon from './assets/aws-icons/cloudfront.svg';
import vpcIcon from './assets/aws-icons/vpc.svg';
import type { ServiceType } from '@zuform/core/types';

export const ICONS: Record<ServiceType, string> = {
  apigateway: apigatewayIcon,
  lambda: lambdaIcon,
  ec2: ec2Icon,
  rds: rdsIcon,
  dynamodb: dynamodbIcon,
  s3: s3Icon,
  sqs: sqsIcon,
  sns: snsIcon,
  eventbridge: eventbridgeIcon,
  stepfunctions: stepfunctionsIcon,
  cloudfront: cloudfrontIcon,
  vpc: vpcIcon,
};
