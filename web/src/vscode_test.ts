import { assertEquals, assertFalse, assertStringIncludes, assertThrows } from '@std/assert';
import type { Edge } from '@xyflow/react';
import type { AwsNode } from '@zuform/core/types';
import { DEFAULT_NAMING } from '@zuform/core/types';
import { ArchParseError } from '@zuform/core/archfile';
import {
  isInVsCode,
  onInit,
  parseDiagramText,
  postDiagramChanged,
  sanitizeDiagram,
  serializeDiagramText,
} from './vscode.ts';
import { t } from './i18n.ts';

function sampleNode(): AwsNode {
  return {
    id: 'lambda-1',
    type: 'aws',
    position: { x: 10, y: 20 },
    data: { serviceType: 'lambda', label: 'lambda-1' },
    // React Flowが実行時に付与する一時的な状態
    selected: true,
    dragging: false,
    measured: { width: 100, height: 84 },
  } as AwsNode;
}

Deno.test('isInVsCode: acquireVsCodeApi が無い環境ではfalse（ブラウザ単体）', () => {
  assertFalse(isInVsCode());
});

Deno.test('sanitizeDiagram: 一時的なUI状態（選択・実測サイズ）を落とす', () => {
  const edge: Edge = { id: 'e1', source: 'a', target: 'b', selected: true };
  const result = sanitizeDiagram({
    version: 2,
    nodes: [sampleNode()],
    edges: [edge],
    naming: DEFAULT_NAMING,
  });

  const node = result.nodes[0] as Record<string, unknown>;
  assertEquals(node.selected, undefined);
  assertEquals(node.dragging, undefined);
  assertEquals(node.measured, undefined);
  // 保存すべき値は残る
  assertEquals(node.id, 'lambda-1');
  assertEquals(node.position, { x: 10, y: 20 });
  assertEquals((result.edges[0] as Record<string, unknown>).selected, undefined);
  assertEquals(result.naming, DEFAULT_NAMING);
});

Deno.test('sanitizeDiagram: 元のオブジェクトを変更しない（非破壊）', () => {
  const node = sampleNode();
  sanitizeDiagram({ version: 2, nodes: [node], edges: [], naming: DEFAULT_NAMING });
  assertEquals(node.selected, true);
});

Deno.test('VSCode外ではブリッジが何もしない（送信もリスナー登録もしない）', () => {
  // 例外が出ないこと、および購読解除がそのまま呼べることを確認する
  postDiagramChanged({ nodes: [], edges: [], naming: DEFAULT_NAMING }, 'yaml');
  const dispose = onInit(() => {
    throw new Error('VSCode外ではハンドラが呼ばれてはいけない');
  });
  globalThis.dispatchEvent(
    new MessageEvent('message', { data: { type: 'init', text: '', language: 'yaml' } }),
  );
  dispose();
});

// ---------- ドキュメントテキスト → 図 ----------

Deno.test('parseDiagramText(yaml): archfile形式を読み、往復しても図が保たれる', () => {
  const text = serializeDiagramText(
    {
      nodes: [sampleNode()],
      edges: [],
      naming: DEFAULT_NAMING,
    },
    'yaml',
  );
  assertStringIncludes(text, 'resources:');
  assertStringIncludes(text, 'type: lambda');

  const parsed = parseDiagramText(text, 'yaml');
  assertEquals(parsed.warnings, []);
  assertEquals(parsed.nodes.length, 1);
  assertEquals(parsed.nodes[0].data.label, 'lambda-1');
  assertEquals(parsed.nodes[0].position, { x: 10, y: 20 });
  assertEquals(parsed.naming, DEFAULT_NAMING);
});

Deno.test('parseDiagramText(yaml): 空テキストは空の図（新規ファイル）', () => {
  const parsed = parseDiagramText('', 'yaml');
  assertEquals(parsed.nodes, []);
  assertEquals(parsed.edges, []);
  assertEquals(parsed.naming, DEFAULT_NAMING);
});

Deno.test('parseDiagramText(yaml): 壊れたYAMLは ArchParseError を投げる', () => {
  // 壊れたテキストを黙って空の図にすると、キャンバス側から上書きしてファイルを壊す
  assertThrows(() => parseDiagramText('resources:\n  - [', 'yaml'), ArchParseError);
});

Deno.test('parseDiagramText(json): 旧形式（*.awsdiagram.json）を後方互換で読む', () => {
  const text = JSON.stringify({
    version: 2,
    nodes: [sampleNode()],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
    naming: { project: 'legacy', pattern: '{name}', commonTags: false },
  });

  const parsed = parseDiagramText(text, 'json');
  assertEquals(parsed.nodes.length, 1);
  assertEquals(parsed.edges.length, 1);
  assertEquals(parsed.naming.project, 'legacy');
  assertEquals(parsed.warnings, []);
});

Deno.test('parseDiagramText(json): 空テキストは空の図', () => {
  const parsed = parseDiagramText('   ', 'json');
  assertEquals(parsed.nodes, []);
  assertEquals(parsed.edges, []);
});

Deno.test('parseDiagramText(json): 壊れたJSON・nodes欠落はエラー（日本語メッセージ）', () => {
  assertThrows(
    () => parseDiagramText('{ "nodes": [', 'json'),
    Error,
    t('ja', 'doc.jsonSyntaxInvalid', { detail: '' }),
  );
  assertThrows(
    () => parseDiagramText('{ "edges": [] }', 'json'),
    Error,
    t('ja', 'doc.jsonMissingArrays'),
  );
});

Deno.test('parseDiagramText(json): UI言語が en ならエラーメッセージも英語になる', () => {
  assertThrows(
    () => parseDiagramText('{ "edges": [] }', 'json', 'en'),
    Error,
    t('en', 'doc.jsonMissingArrays'),
  );
});

// ---------- 図 → ドキュメントテキスト ----------

Deno.test('serializeDiagramText(json): 旧形式で書き出し、一時的なUI状態を落とす', () => {
  const text = serializeDiagramText(
    { nodes: [sampleNode()], edges: [], naming: DEFAULT_NAMING },
    'json',
  );
  const parsed = JSON.parse(text);
  assertEquals(parsed.version, 2);
  assertEquals(parsed.nodes[0].selected, undefined);
  assertEquals(parsed.nodes[0].measured, undefined);
  // 末尾は改行（ファイル差分を安定させるため）
  assertEquals(text.endsWith('\n'), true);
});

Deno.test('serializeDiagramText(yaml): YAML形式で書き出す（JSONにはならない）', () => {
  const text = serializeDiagramText(
    { nodes: [sampleNode()], edges: [], naming: DEFAULT_NAMING },
    'yaml',
  );
  assertEquals(text.startsWith('version: 1'), true);
  assertStringIncludes(text, 'layout:');
});

Deno.test('serializeDiagramText(yaml): previousTextを渡すとコメントを保持したまま直列化する（coreへ委譲）', () => {
  const previousText = `version: 1
project: myapp
naming:
  pattern: "{project}-{env}-{name}"
  commonTags: true

resources:
  lambda-1: # 大事な関数
    type: lambda

connections: []

layout:
  lambda-1: [10, 20]
`;
  const text = serializeDiagramText(
    { nodes: [sampleNode()], edges: [], naming: DEFAULT_NAMING },
    'yaml',
    previousText,
  );
  assertStringIncludes(text, '# 大事な関数');
});

Deno.test('serializeDiagramText(json): previousTextを渡してもJSON形式では無視される', () => {
  const text = serializeDiagramText(
    { nodes: [sampleNode()], edges: [], naming: DEFAULT_NAMING },
    'json',
    'this is not used for json',
  );
  const parsed = JSON.parse(text);
  assertEquals(parsed.version, 2);
});
