# ROADMAP

進行管理は **GitHub Issues / Milestones** へ移行しました。
このファイルは入口だけを示すポインタです（個別の起票・議論はIssueで行ってください）。

## いま追いかけている場所

- [Issues 一覧](https://github.com/tsekino62/zuform/issues) — 起票された課題・要望
- [Milestones 一覧](https://github.com/tsekino62/zuform/milestones) — 下記3本で優先度を管理

| マイルストーン | 内容 |
|---------------|------|
| **v0.2 OSS公開整備** | ライブデモ公開、UIの英語化、ドキュメント整備、VSCode拡張の実機確認 |
| **v0.3 サービス拡充** | ALB / ECS・Fargate / Secrets Manager / Route 53 / Cognito など対応サービスの追加 |
| **Backlog** | ヒントの観点プロファイル、YAMLコメント保持、tf→図の逆生成、コスト概算などの研究テーマ |

## これまでの主な完了実績

- **アーキテクチャ定義ファイル（`*.awsarch.yaml`）**: 人が読み書きできるYAML宣言形式を正とし、`layout` 省略時はdagreで自動レイアウト
- **DEV / STG / PRD の3環境生成**: ノード単位の環境選択と環境プロファイル、`environments/{dev,stg,prd}/` 一括ダウンロード
- **手編集との共存**: ノードの「追加HCL」欄・同梱 `custom.tf`・override による、再生成しても消えない編集手段
- **VSCode拡張（プロトタイプ）**: カスタムエディタでのテキスト⇄キャンバス双方向編集と、ワークスペースへの書き出し
- **OSS体裁**: 「AWS Builder」から **Zuform** へ改名、CI（型チェック・テスト・`terraform validate`）、CONTRIBUTING・Issue/PRテンプレート整備
