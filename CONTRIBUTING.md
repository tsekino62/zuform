# Contributing to Zuform

Zuformへの貢献を検討いただきありがとうございます。このドキュメントは、コントリビューションの種類ごとの流れと、開発環境のセットアップ方法をまとめたものです。

## 歓迎するコントリビューション

- **新しいAWSサービスの追加**: ALB / ECS / Secrets Manager など、まだ対応していないAWSサービスのサポート（詳しくは後述の「新しいAWSサービスを追加する」を参照）
- **テンプレート追加**: `core/templates.ts` へのユースケース別テンプレートの追加・改善
- **バグ報告**: 生成されるTerraformコードの誤り、UIの不具合、VSCode拡張の不具合など
- **ドキュメント改善**: README / ROADMAP / このファイル自体の誤りの修正や分かりにくい箇所の改善

まずは [Issue](https://github.com/tsekino62/zuform/issues) を立てて、対応方針をすり合わせてから作業を始めることをおすすめします（特に新しいAWSサービスの追加など、規模の大きい変更の場合）。

## 開発環境のセットアップ

必要なものは [Deno](https://deno.com/) 2.x のみです。npm / package.json は使用しません（依存関係は `deno.json` で一元管理し、`node_modules/` はDenoが自動生成します）。

```bash
git clone https://github.com/tsekino62/zuform.git
cd zuform
deno task dev
```

ブラウザで http://localhost:5173 を開きます。

| コマンド | 内容 |
|---------|------|
| `deno task dev` | 開発サーバー起動 |
| `deno task build` | 本番ビルド（`web/dist/`） |
| `deno task test` | ジェネレータのテスト（スナップショット含む） |
| `deno task test:update` | スナップショットの更新 |
| `deno task check` | 型チェック |
| `deno task fixtures` | 全テンプレート×全環境のTerraformコードを `fixtures/` に出力 |

VSCode拡張（`vscode-ext/`）をビルドする場合は次のコマンドを使います（内部で `npm install` / `npm run build` を実行します）。

```bash
deno task ext:build
```

## 新しいAWSサービスを追加する

サービス1つにつき `core/registry/` へ1ファイル追加する構成になっています。以下の手順で進めてください。

1. **ServiceModuleの実装**

   `core/registry/` に新規ファイル（例: `alb.ts`）を作成し、既存のモジュール（例: `sqs.ts` や `dynamodb.ts`）を参考に `ServiceModule` を実装します。最低限、以下を定義します。

   - `type` / `displayName` / `category` / `description`: パレット表示用の情報
   - `connectsTo`: このサービスから接続できる相手と、その接続が持つ意味（例: `lambda: 'キューに入ったメッセージをLambdaで処理します'`）
   - `generate(node, ctx)`: 接続関係に応じたHCLコードを文字列で返す関数
   - `outputs`（必要な場合）: 生成される出力値

2. **registryへの登録**

   `core/registry/index.ts` の `REGISTRY` 配列に、作成したモジュールをimportして追加します。配列の順序がパレット表示順・コード生成の出力順になります。

3. **アイコンの追加**

   [AWS公式 Architecture Icons](https://aws.amazon.com/jp/architecture/icons/) から該当サービスのSVGを取得し、`web/src/assets/aws-icons/` に配置します。これらのアイコンはAWSの利用条件に従うものでプロジェクトのMITライセンスの対象外です。既存の [`NOTICE.md`](web/src/assets/aws-icons/NOTICE.md) の流儀（出典・ライセンス表記）に従ってください。追加後、`web/src/icons.ts` の `ICONS` マップにインポートを追加します。

   なお `icons.ts` はUI専用モジュールです。`deno test` はSVGを読み込めないため、`registry/` 配下（コード生成ロジック）から `icons.ts` をimportしないよう注意してください。

4. **テストの追加**

   `core/generator_test.ts` に、新しいサービス単体および既存サービスとの接続を含むテストケースを追加し、`deno task test` を実行します。生成コードの内容を確認したい場合はスナップショットテスト（`assertSnapshot`）を使うと確認・レビューがしやすくなります。

5. **可能であればfixturesとterraform validateの確認**

   `deno task fixtures` で全テンプレート×全環境のコードを再生成し、生成先のディレクトリで `terraform validate` を通しておくと、CIで検出される問題を事前に潰せます（Terraformがローカルにインストールされている場合）。

```bash
deno task fixtures
cd fixtures/<template>/<env>
terraform init -backend=false
terraform validate
```

## テスト方針

- 新機能・新サービスには対応するテストを必ず追加してください（`core/generator_test.ts` など）。
- スナップショットを更新する場合は `deno task test:update` を使用してください。
- **生成されるTerraformコードが変わる変更**（既存サービスのHCLテンプレート修正など）は、PRの説明にスナップショットのdiffを含め、何がどう変わったか・なぜ変わったかを説明してください。レビュアーが生成結果の変化を把握しやすくなります。

## コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) 形式に従ってください。

```
<type>: <description>
```

主に使う `type`:

| type | 用途 |
|------|------|
| `feat` | 新機能（新サービス対応・新テンプレートなど） |
| `fix` | バグ修正 |
| `refactor` | 挙動を変えないコード整理 |
| `docs` | ドキュメントのみの変更 |
| `test` | テストの追加・修正のみ |
| `chore` | ビルド設定・依存関係更新など |
| `perf` | パフォーマンス改善 |
| `ci` | CI設定の変更 |

## PRを送る前に

以下がすべて通ることを確認してください（CIでも同じ内容を検証します）。

```bash
deno task check
deno task test
deno task build
```

型チェック・テスト・ビルドがすべて緑になった状態でPRを作成してください。生成コードが変わる変更やUIの見た目が変わる変更については、上記に加えてPRテンプレートのチェックリストに従って説明を記載してください。

ご協力ありがとうございます。
