# Changelog

このプロジェクトの変更点は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) の形式に従って記録します。

## [0.1.0] - 2026-08-15

初回リリース。

### 追加

- `*.awsarch.yaml`（および後方互換の `*.awsdiagram.json`）を開くカスタムエディタ `zuform.diagram`
- キャンバスでの編集とYAMLテキスト編集の双方向同期（`WorkspaceEdit` によるドキュメント反映、テキスト編集の自動追従）
- コマンドパレットからの新規構成図作成（`Zuform: 新しい構成図を作成`）
- 右パネルからワークスペースの `terraform/environments/{dev,stg,prd}/` へのTerraformコード書き出し
- パース失敗時に最後の正常状態を維持しつつエラーバナーを表示する安全機構
