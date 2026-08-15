# Zuform

名前の由来: 図(zu) × form。図(zu)からTerraformを生成するツールという意味です。

AWSのリソースを **draw.io のような画面でドラッグ&ドロップ配置** し、アイコン同士を矢印でつなぐと **DEV / STG / PRD 3環境分のTerraformコードを自動生成** する初心者向けWebツールです。

![アーキテクチャ図からTerraformを生成](docs/screenshot.png)

## できること

- パレットから **API Gateway / CloudFront / Lambda / EC2 / SQS / SNS / EventBridge / Step Functions / DynamoDB / RDS / S3 / VPC** をドラッグ&ドロップ
- アイコンの右端の丸 → 別アイコンの左端の丸をドラッグして **矢印で接続**
- **VPCの枠**（リサイズ可能なグループ）の中にリソースを配置
- 接続の意味に応じた **Terraformコードをリアルタイム生成**
  - API Gateway → Lambda: HTTP API・統合・ルート・実行許可
  - Lambda → RDS: VPC設定・セキュリティグループ・環境変数
  - Lambda → DynamoDB / S3 / SQS / SNS: **最小権限のIAMポリシー** ・環境変数
  - SQS → Lambda: イベントソースマッピング + DLQ（デッドレターキュー）
  - EventBridge → Lambda / Step Functions: 定期バッチ（cron / rate）
  - Step Functions → Lambda: つないだ順に実行するワークフロー定義
  - CloudFront → S3: OACによる非公開バケットの静的サイト配信
- **テンプレートギャラリー**: 用途（API開発 / バッチ / 静的サイト / ファイル保存 / Webサーバー）から定番構成7種を選んで開始
- **命名規則**: `{project}-{env}-{name}` 形式のパターンを設定でき、全リソースの物理名と共通タグ（Project / Environment / ManagedBy）に反映
- **DEV / STG / PRD 3環境対応**:
  - ノードごとに「作成する環境」を選択（例: WAFはPRDのみ、検証用リソースはDEVのみ）
  - 環境プロファイル: DEVは小さく安く（`db.t3.micro`・削除保護なし）、PRDは堅牢に（マルチAZ・削除保護・7日バックアップ）
  - `environments/{dev,stg,prd}/main.tf` 構成のZIP一括ダウンロード（tfstateが環境ごとに分離）
- 図を **アーキテクチャ定義ファイル（`*.awsarch.yaml`）** として保存/読み込み、ブラウザへの自動保存

アイコンは [AWS公式 Architecture Icons](https://aws.amazon.com/jp/architecture/icons/) を使用しています（[NOTICE](src/assets/aws-icons/NOTICE.md)）。

## 起動方法

[Deno](https://deno.com/) 2.x が必要です（npm / package.json は使いません。依存は `deno.json` で管理され、`node_modules/` はDenoが自動生成します）。

```bash
deno task dev
```

ブラウザで http://localhost:5173 を開きます。

| コマンド | 内容 |
|---------|------|
| `deno task dev` | 開発サーバー起動 |
| `deno task build` | 本番ビルド（`dist/`） |
| `deno task test` | ジェネレータのテスト（スナップショット含む） |
| `deno task test:update` | スナップショットの更新 |
| `deno task check` | 型チェック |

## 生成したコードの使い方

1. 右パネルの「⬇ 全環境ZIP」でダウンロード・展開
2. 環境のディレクトリへ移動して実行:

```bash
cd environments/dev
terraform init
terraform plan
terraform apply
```

- Lambdaを含む構成では、デプロイパッケージ(zip)を `build/<関数名>.zip` に配置してください（生成コード内にコメントで手順があります）
- **IAMについて**: Terraformは宣言したものだけを作成します。このツールは矢印の意味からLambdaの実行ロールや接続先ごとの最小権限ポリシーを生成しますが、`terraform apply` を実行するユーザー/CI自身にはIAM作成権限（`iam:CreateRole` 等）が必要です

### 生成コードを手で編集したい場合

3つの方法があり、いずれも図から再生成しても消えません:

1. **ノードの「追加HCL」欄**（おすすめ）: ノードを選択してインスペクタの「追加HCL」に属性を書くと、そのリソースブロック末尾に挿入されます（例: `memory_size = 512`）。アーキテクチャ定義ファイルの `extra_hcl` として保存されます
2. **`custom.tf` への追記**: リソースの追加はZIP同梱の `custom.tf` へ（Terraformは同一ディレクトリの `.tf` をすべて結合します）
3. **override**: 生成済みリソースの属性だけ変えたい場合は `main_override.tf` を作り、同名のresourceブロックに変更したい属性だけを書きます（[override機能](https://developer.hashicorp.com/terraform/language/files/override)）

## アーキテクチャ定義ファイル（`*.awsarch.yaml`）

ヘッダーの **「図を保存」は YAML形式（`diagram.awsarch.yaml`）** で書き出します。
人が読んで手で書き換えられる宣言形式なので、Gitの差分レビューにも向いています。

「図を開く」は `*.awsarch.yaml`（YAML）と、**旧形式の `*.awsdiagram.json` の両方**を読み込めます
（拡張子で自動判定。旧形式のJSONは引き続きサポートしますが、保存はYAMLに一本化されました）。

```yaml
version: 1
project: myapp          # 命名規則の {project}
naming:
  pattern: "{project}-{env}-{name}"
  commonTags: true      # Project / Environment / ManagedBy の共通タグを付ける

resources:              # キー = リソース名（そのまま図のラベル・Terraformの名前になる）
  my-vpc:
    type: vpc
  user-api:
    type: apigateway
  get-users:
    type: lambda
    in: my-vpc          # VPCの枠の中に配置する（inに指定できるのは type: vpc のみ）
    envs: [dev, stg]    # 作成する環境を絞る（省略時は dev / stg / prd すべて）
    extra_hcl: |        # 生成されるresourceブロックの末尾へそのまま挿入される
      memory_size = 512
  users-db:
    type: rds
    in: my-vpc

connections:            # "呼び出す側 -> 呼び出される側"
  - user-api -> get-users
  - get-users -> users-db

layout:                 # 図の座標（省略可）。vpcは [x, y, 幅, 高さ]、それ以外は [x, y]
  my-vpc: [360, 80, 560, 340]
  user-api: [80, 210]
```

| キー | 説明 |
|------|------|
| `version` | ファイル形式のバージョン（現在は `1`） |
| `project` / `naming` | 命名規則。設定モーダルの内容と対応 |
| `resources.<名前>.type` | `apigateway` / `lambda` / `ec2` / `rds` / `dynamodb` / `s3` / `sqs` / `sns` / `eventbridge` / `stepfunctions` / `cloudfront` / `vpc` |
| `resources.<名前>.in` | 親となるVPCのリソース名 |
| `resources.<名前>.envs` | 作成する環境の配列（`dev` / `stg` / `prd`） |
| `resources.<名前>.extra_hcl` | 生成コードへ差し込む追加HCL（インスペクタの「追加HCL」と同じもの） |
| `connections` | `"from -> to"` 形式の文字列の配列 |
| `layout` | 座標。**省略すると自動レイアウト**（左→右）で配置されます |

`layout` を書かずに `resources` と `connections` だけ書けば、図は自動で並びます。
手書きで構成を起こすときは座標を気にせず書き始めてください。

## VSCode拡張（プロトタイプ）

`vscode-ext/` にVSCode拡張があります。`*.awsarch.yaml`（旧形式の `*.awsdiagram.json` も可）を開くとキャンバスがカスタムエディタとして起動し、「ワークスペースへ書き出し」でワークスペースの `terraform/` 配下に実ファイルとして出力できます（HashiCorp公式Terraform拡張でそのまま編集可能）。

YAMLをテキストエディタで直接書き換えるとキャンバスへ即座に反映され、キャンバスで編集するとYAMLが書き換わります（双方向編集）。ビルドとデバッグ手順は [vscode-ext/README.md](vscode-ext/README.md) を参照。

```bash
deno task ext:build
```

## 技術スタック

| 領域 | 採用技術 |
|------|---------|
| ランタイム / パッケージ管理 | Deno 2 (`deno.json` 一元管理) |
| UI | React 19 + TypeScript + Vite |
| ノードエディタ | [React Flow (@xyflow/react)](https://reactflow.dev/) |
| IaC出力 | Terraform (AWS Provider ~> 5.0) |
| テスト | `deno test` + `@std/testing` スナップショット |

## プロジェクト構成

```
src/
├── aws/
│   ├── types.ts           # 共有型・環境プロファイル・命名設定
│   ├── generator.ts       # 環境別生成のオーケストレータ（命名・環境フィルタ）
│   ├── generator_test.ts  # テスト（スナップショット含む）
│   ├── archfile.ts        # *.awsarch.yaml ⇄ 図（自動レイアウト込み）
│   ├── icons.ts           # 公式アイコン（UI専用）
│   └── registry/          # ★サービスごとに1ファイル
│       ├── index.ts       # レジストリ（接続ルールもここから導出）
│       ├── apigateway.ts / cloudfront.ts / lambda.ts / ec2.ts
│       ├── sqs.ts / sns.ts / eventbridge.ts / stepfunctions.ts
│       └── dynamodb.ts / rds.ts / s3.ts / vpc.ts
├── flow/
│   └── templates.ts       # 用途別テンプレート定義
└── components/            # パレット / ノード / コードパネル / モーダル類
```

## サービスの追加方法（コントリビューション歓迎）

1. `src/aws/registry/` に `ServiceModule` 実装を1ファイル追加
   - パレット表示情報・接続ルール（`connectsTo`）・HCL生成（`generate`）・出力（`outputs`）
2. `src/aws/registry/index.ts` の配列に登録
3. `src/aws/icons.ts` に公式アイコンを追加
4. `src/aws/generator_test.ts` にテストケースを追加して `deno task test`

## CI

GitHub Actions（[.github/workflows/ci.yml](.github/workflows/ci.yml)）で以下を検証します:

1. `deno task check` / `deno task test` / `deno task build`
2. 全テンプレート×全環境（21ファイル）の生成コードを `terraform validate` で検証

今後の予定は [ROADMAP.md](ROADMAP.md) を参照（VSCode拡張化、ヒントの観点プロファイル、ALB/ECS追加など）。

## 注意

- 生成コードのDEV既定値は学習・検証向け（`skip_final_snapshot = true` など）です。PRDプロファイルでも、本番導入時はパスワード管理（Secrets Manager）・監視・ネットワーク設計を必ずレビューしてください
- `terraform apply` はAWS利用料金が発生します。試した後は `terraform destroy` を忘れずに
