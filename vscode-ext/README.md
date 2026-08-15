# Zuform — VSCode拡張（プロトタイプ）

`*.awsarch.yaml`（アーキテクチャ定義ファイル）を **Zuform のキャンバスUI** で開くカスタムエディタです。
図を編集するとファイルのYAMLが書き換わり、`Ctrl+S` で通常のファイルとして保存できます。
逆に、YAMLをテキストエディタで直接書き換えると、その内容がキャンバスへ即座に反映されます（**テキスト ⇄ キャンバスの双方向編集**）。

旧形式の `*.awsdiagram.json`（React Flowの内部形式をそのままダンプしたJSON）も、後方互換のためこれまでどおり開けます。
その場合はJSONのまま読み書きされます（勝手にYAMLへ変換はしません）。

## できること

| 機能 | 説明 |
| --- | --- |
| カスタムエディタ | `*.awsarch.yaml` / `*.awsdiagram.json` を開くとキャンバスが起動（`viewType: zuform.diagram`） |
| ドキュメント同期 | 編集内容が `WorkspaceEdit` でファイルへ反映される。undo / ダーティ表示 / `Ctrl+S` はVSCode標準どおり |
| テキスト編集の反映 | 別タブや別エディタでYAMLを直すと、キャンバスが自動で追従する |
| ワークスペースへ書き出し | 右パネルのボタンで `terraform/environments/{dev,stg,prd}/main.tf` などを生成 |
| コマンド | コマンドパレット → `Zuform: 新しい構成図を作成`（既定は `diagram.awsarch.yaml`） |

YAMLの書式は、リポジトリルートの `README.md` の「アーキテクチャ定義ファイル（`*.awsarch.yaml`）」を参照してください。

書き出し先は **最初のワークスペースフォルダ配下の `terraform/`** です。
`custom.tf` は手で書き足すためのファイルなので、**既にあれば上書きしません**。

### YAMLをテキストとして開きたいとき

`*.awsarch.yaml` は既定でキャンバス（カスタムエディタ）が開きます。
テキストとして編集したい場合は、エクスプローラでファイルを右クリック →
**「これで開く…」→「テキスト エディター」** を選んでください。
キャンバスのタブと並べて開けば、片方の編集がもう片方へ反映される様子を確認できます。

## ビルド

WebviewのUIはWebアプリのViteビルド成果物（`web/dist/`）を `vscode-ext/media/` にコピーして使います。
YAMLの解釈・生成（`core/archfile.ts`）もこのバンドルに含まれます。

```bash
# 1. リポジトリルートで UI をビルド
deno task build

# 2. 拡張をビルド（media/ のコピー + esbuild）
cd vscode-ext
npm install
npm run build
```

ルートから一括で実行する場合:

```bash
deno task ext:build
```

## F5でデバッグする

1. 上の「ビルド」を実行しておく
2. VSCode で **`vscode-ext` ディレクトリを開く**（リポジトリルートではない点に注意）
3. `F5`（Extension Development Host が別ウィンドウで起動）
4. 新ウィンドウで適当なフォルダを開き、`*.awsarch.yaml` を作成して開く
   - コマンドパレットの `Zuform: 新しい構成図を作成` からでもよい
5. 図を編集 → `Ctrl+S` で保存、右パネルの「ワークスペースへ書き出し」でTerraformを生成

UIを直したときは、ルートで `deno task build` → 拡張側で `npm run build` を実行し、
Extension Development Host を再起動してください（`media/` の再コピーが必要です）。

## パッケージング

```bash
npx @vscode/vsce package --no-dependencies
```

`publisher` が `local-dev` のためMarketplaceへは公開できません。
生成された `.vsix` は `code --install-extension zuform-vscode-0.0.1.vsix` でローカルに入れられます。

## メッセージプロトコル

**テキストベース**のプロトコルです。拡張ホストはドキュメントの生テキストを運ぶだけで、
YAML / JSON の中身を一切解釈しません。フォーマットの解釈・生成はすべてWebview側
（`../core/archfile.ts`）が担当します。

Web側の実装は `../web/src/vscode.ts`、拡張側は `src/messages.ts` にあります。片方を変えたら両方直してください。

| 方向 | メッセージ | 用途 |
| --- | --- | --- |
| Webview → 拡張 | `{ type: 'ready' }` | Webviewの準備完了。拡張はこれを受けて `init` を返す |
| Webview → 拡張 | `{ type: 'diagramChanged', text }` | 図が編集された（Web側で300msデバウンス）。`text` は記法に合わせて直列化済みの本文。拡張は `WorkspaceEdit` で全置換するだけ |
| Webview → 拡張 | `{ type: 'writeFiles', files }` | `files` は `terraform/` からの相対パス → 内容 |
| 拡張 → Webview | `{ type: 'init', text, language }` | ドキュメントの生テキスト（`document.getText()`）をキャンバスへ反映せよ。`language` はファイル名から判定した `'yaml'` / `'json'` |

`language` の判定: ファイル名が `*.awsarch.yaml` / `*.yaml` / `*.yml` なら `'yaml'`、それ以外は `'json'`。

無限ループの防止:

- 拡張は「自分が書いたテキスト」を覚えておき（`syncedText`）、それと一致する変更では `init` を送り返さない
- Webviewは `init` 直後の1回だけ `diagramChanged` の送信を抑止し、`init` 受信前は一切送信しない

## パースに失敗したときの挙動（重要）

テキスト編集の途中でYAMLが一時的に壊れることは普通に起こります。
そのとき **キャンバスの内容でファイルを上書きしてしまうと、書きかけの編集が消えて壊れます**。
そのため次の動きになります。

1. `init` のテキストが読み取れないと、キャンバスは **最後に読み取れた状態のまま** 維持される（空にしない）
2. キャンバス上部に **赤いエラーバナー** が出て、日本語のエラーメッセージを表示する
3. その間は、キャンバス側で何を操作しても `diagramChanged` を **送らない**（ファイルを書き換えない）
4. テキストが直って再び読み取れたら、バナーが消えて同期が再開する

バナーの「×」は表示を消すだけです。**ファイルが直るまで同期は止まったまま**です。

なお、空ファイル（新規作成直後）はエラーではなく「空の構成図」として扱います。

## 既知の制限

- 図の同期はドキュメント全置換なので、undo の粒度は「操作単位」ではなく「同期単位（デバウンス300ms）」になります
- キャンバスから書き戻すとYAMLは正規化されます。**コメント・キーの並び順・空行は保持されません**
- 同じファイルを複数タブで同時に開くことは想定していません（`supportsMultipleEditorsPerDocument: false`）
- 書き出し先は最初のワークスペースフォルダ固定です（マルチルートでの選択UIはありません）
- 右パネルの「⬇ dev.main.tf」など**単体ファイルのダウンロード**はブラウザ向けの機能で、Webview内では動きません。
  VSCodeでは「ワークスペースへ書き出し」を使ってください
- `publisher: local-dev` かつ `repository` 未設定のため、`vsce package` 実行時に警告が出ます（パッケージ自体は成功します）
