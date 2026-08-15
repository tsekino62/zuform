import { assert, assertEquals, assertThrows } from '@std/assert';
import { ArchParseError, parseArchYaml, serializeArchYaml } from './archfile.ts';
import { generateForEnv } from './generator.ts';
import { DEFAULT_NAMING } from './types.ts';
import type { AwsNode } from './types.ts';
import { TEMPLATES } from './templates.ts';

const SAMPLE_YAML = `
version: 1
project: myapp
naming:
  pattern: "{project}-{env}-{name}"
  commonTags: true

resources:
  my-vpc:
    type: vpc
  user-api:
    type: apigateway
  get-users:
    type: lambda
    in: my-vpc
    envs: [dev, stg]
    extra_hcl: |
      memory_size = 512
  users-db:
    type: rds
    in: my-vpc

connections:
  - user-api -> get-users
  - get-users -> users-db

layout:
  my-vpc: [360, 80, 560, 340]
  user-api: [80, 210]
`;

function findNode(nodes: AwsNode[], id: string): AwsNode {
  const n = nodes.find((n) => n.id === id);
  if (!n) throw new Error(`node not found: ${id}`);
  return n;
}

// ---------- 1. サンプルYAMLの基本パース ----------

Deno.test('parseArchYaml: サンプルYAMLからノード4/エッジ2を復元する', () => {
  const { nodes, edges, naming, warnings } = parseArchYaml(SAMPLE_YAML);

  assertEquals(warnings, []);
  assertEquals(nodes.length, 4);
  assertEquals(edges.length, 2);

  assertEquals(naming, {
    project: 'myapp',
    pattern: '{project}-{env}-{name}',
    commonTags: true,
  });

  // vpcが先頭
  assertEquals(nodes[0].id, 'my-vpc');
  assertEquals(nodes[0].type, 'vpc');
  assertEquals(nodes[0].position, { x: 360, y: 80 });
  assertEquals(nodes[0].style, { width: 560, height: 340 });

  const userApi = findNode(nodes, 'user-api');
  assertEquals(userApi.type, 'aws');
  assertEquals(userApi.parentId, undefined);
  assertEquals(userApi.position, { x: 80, y: 210 });
  assertEquals(userApi.data.serviceType, 'apigateway');
  assertEquals(userApi.data.label, 'user-api');

  const getUsers = findNode(nodes, 'get-users');
  assertEquals(getUsers.parentId, 'my-vpc');
  assertEquals(getUsers.data.serviceType, 'lambda');
  assertEquals(getUsers.data.envs, ['dev', 'stg']);
  assertEquals(getUsers.data.extraHcl, 'memory_size = 512\n');
  // 親(my-vpc)からの相対座標であること（絶対座標ではない）
  assert(getUsers.position.x < 560);
  assert(getUsers.position.y < 340);

  const usersDb = findNode(nodes, 'users-db');
  assertEquals(usersDb.parentId, 'my-vpc');
  assertEquals(usersDb.data.serviceType, 'rds');
  assertEquals(usersDb.data.envs, undefined);
  assertEquals(usersDb.data.extraHcl, undefined);

  const edgeIds = edges.map((e) => `${e.source}->${e.target}`).sort();
  assertEquals(edgeIds, ['get-users->users-db', 'user-api->get-users']);
  assert(edges.every((e) => e.id === `e-${e.source}-${e.target}`));
});

// ---------- 2. ラウンドトリップ ----------

Deno.test('ラウンドトリップ: parse→serialize→parseでモデルが一致する', () => {
  const first = parseArchYaml(SAMPLE_YAML);
  const yamlAgain = serializeArchYaml(first.nodes, first.edges, first.naming);
  const second = parseArchYaml(yamlAgain);

  assertEquals(second.naming, first.naming);
  assertEquals(second.edges.map((e) => [e.source, e.target]).sort(), [
    ['get-users', 'users-db'],
    ['user-api', 'get-users'],
  ]);

  const simplify = (nodes: AwsNode[]) =>
    nodes
      .map((n) => ({
        id: n.id,
        label: n.data.label,
        type: n.data.serviceType,
        parentId: n.parentId,
        envs: n.data.envs,
        extraHcl: n.data.extraHcl,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

  assertEquals(simplify(second.nodes), simplify(first.nodes));
});

// ---------- 3. 自動レイアウト ----------

Deno.test('自動レイアウト: layout未指定のYAMLで全ノードに有限な整数座標が付く', () => {
  const yaml = `
resources:
  app-vpc:
    type: vpc
  api:
    type: apigateway
  fn:
    type: lambda
    in: app-vpc
  db:
    type: rds
    in: app-vpc

connections:
  - api -> fn
  - fn -> db
`;
  const { nodes } = parseArchYaml(yaml);
  assertEquals(nodes.length, 4);

  for (const n of nodes) {
    assert(Number.isFinite(n.position.x), `${n.id}.position.x が有限でない`);
    assert(Number.isFinite(n.position.y), `${n.id}.position.y が有限でない`);
    assertEquals(n.position.x, Math.round(n.position.x));
    assertEquals(n.position.y, Math.round(n.position.y));
  }

  const vpc = findNode(nodes, 'app-vpc');
  const width = vpc.style?.width as number;
  const height = vpc.style?.height as number;
  assert(Number.isFinite(width) && width > 0);
  assert(Number.isFinite(height) && height > 0);

  // vpcの子は親相対座標であり、親の枠内に収まっていること
  for (const childId of ['fn', 'db']) {
    const child = findNode(nodes, childId);
    assertEquals(child.parentId, 'app-vpc');
    assert(child.position.x >= 0, `${childId}.x が枠の左端より外`);
    assert(child.position.y >= 0, `${childId}.y が枠の上端より外`);
    assert(child.position.x <= width, `${childId}.x が枠の右端より外`);
    assert(child.position.y <= height, `${childId}.y が枠の下端より外`);
  }
});

// ---------- 4. エラー系 ----------

Deno.test('エラー: 未知のtypeはArchParseErrorになりリソース名を含む', () => {
  const yaml = `
resources:
  weird-thing:
    type: not-a-real-service
`;
  const err = assertThrows(() => parseArchYaml(yaml), ArchParseError);
  assert(err.message.includes('weird-thing'));
});

Deno.test('エラー: connectionsの参照先が存在しないとArchParseErrorになりリソース名を含む', () => {
  const yaml = `
resources:
  api:
    type: apigateway

connections:
  - api -> ghost-fn
`;
  const err = assertThrows(() => parseArchYaml(yaml), ArchParseError);
  assert(err.message.includes('ghost-fn'));
});

Deno.test('エラー: inがvpc以外を指すとArchParseErrorになりリソース名を含む', () => {
  const yaml = `
resources:
  api:
    type: apigateway
  fn:
    type: lambda
    in: api
`;
  const err = assertThrows(() => parseArchYaml(yaml), ArchParseError);
  assert(err.message.includes('fn'));
  assert(err.message.includes('api'));
});

Deno.test('エラー: vpcがinで別のvpcの中に配置されているとArchParseErrorになる', () => {
  const yaml = `
resources:
  a:
    type: vpc
  b:
    type: vpc
    in: a
`;
  const err = assertThrows(() => parseArchYaml(yaml), ArchParseError);
  assert(err.message.includes('b'));
});

Deno.test('エラー: typeが欠落しているとArchParseErrorになる', () => {
  const yaml = `
resources:
  no-type-here:
    in: my-vpc
`;
  const err = assertThrows(() => parseArchYaml(yaml), ArchParseError);
  assert(err.message.includes('no-type-here'));
});

Deno.test('エラー: connectionsが"a -> b"形式でないとArchParseErrorになる', () => {
  const yaml = `
resources:
  api:
    type: apigateway
  fn:
    type: lambda

connections:
  - "api => fn"
`;
  assertThrows(() => parseArchYaml(yaml), ArchParseError);
});

Deno.test('エラー: YAML構文エラーはArchParseErrorになる', () => {
  const yaml = `
resources:
  api:
    type: apigateway
  api:
    type: lambda
`;
  assertThrows(() => parseArchYaml(yaml), ArchParseError);
});

// ---------- 5. 警告系 ----------

Deno.test('警告: 未知のトップレベルキー・リソース内の未知キーはwarningsに入りモデルは生成される', () => {
  const yaml = `
version: 1
mystery: true

resources:
  api:
    type: apigateway
    weird_field: 123
`;
  const { nodes, warnings } = parseArchYaml(yaml);
  assertEquals(nodes.length, 1);
  assert(warnings.some((w) => w.includes('mystery')));
  assert(warnings.some((w) => w.includes('weird_field')));
});

// ---------- 6. CONNECTION_RULESに無い接続 ----------

Deno.test('警告: CONNECTION_RULESに無い接続(rds -> lambda)はwarningsに入る（エラーにしない）', () => {
  const yaml = `
resources:
  db:
    type: rds
  fn:
    type: lambda

connections:
  - db -> fn
`;
  const { nodes, edges, warnings } = parseArchYaml(yaml);
  assertEquals(nodes.length, 2);
  assertEquals(edges.length, 1);
  assert(warnings.some((w) => w.includes('db -> fn')));
  assert(warnings.some((w) => w.includes('コード生成')));
});

// ---------- 7. 既存テンプレートとの無損失変換 ----------

Deno.test('既存テンプレート: serialize→parseしてもgenerateForEnvの生成結果が一致する', () => {
  for (const tpl of TEMPLATES) {
    const original = generateForEnv(tpl.nodes, tpl.edges, 'dev', DEFAULT_NAMING);
    const yaml = serializeArchYaml(tpl.nodes, tpl.edges, DEFAULT_NAMING);
    const { nodes, edges, naming } = parseArchYaml(yaml);
    const roundTripped = generateForEnv(nodes, edges, 'dev', naming);

    assertEquals(
      roundTripped.code,
      original.code,
      `テンプレート「${tpl.id}」の生成結果が一致しません`,
    );
    assertEquals(roundTripped.hints, original.hints);
  }
});

// ---------- 空テキスト ----------

Deno.test('parseArchYaml: 空テキストはエラーにせず空モデルを返す', () => {
  const { nodes, edges, naming, warnings } = parseArchYaml('');
  assertEquals(nodes, []);
  assertEquals(edges, []);
  assertEquals(naming, DEFAULT_NAMING);
  assertEquals(warnings, []);
});

// ---------- 空リソース重複ラベルの一意化（serialize） ----------

Deno.test('serializeArchYaml: labelが重複する場合は-2 -3で一意化しconnections/layoutも追随する', () => {
  const nodes: AwsNode[] = [
    {
      id: 'n1',
      type: 'aws',
      position: { x: 0, y: 0 },
      data: { serviceType: 'lambda', label: 'fn' },
    },
    {
      id: 'n2',
      type: 'aws',
      position: { x: 100, y: 0 },
      data: { serviceType: 'lambda', label: 'fn' },
    },
  ];
  const edges = [{ id: 'e1', source: 'n1', target: 'n2' }];
  const yaml = serializeArchYaml(nodes, edges, DEFAULT_NAMING);

  assert(yaml.includes('fn:'));
  assert(yaml.includes('fn-2:'));
  assert(yaml.includes('fn -> fn-2'));
  assert(yaml.includes('fn-2:') && yaml.includes('fn:'));

  const { nodes: reparsed, edges: reparsedEdges } = parseArchYaml(yaml);
  assertEquals(reparsed.map((n) => n.id).sort(), ['fn', 'fn-2']);
  assertEquals(reparsedEdges.length, 1);
  assertEquals(reparsedEdges[0].source, 'fn');
  assertEquals(reparsedEdges[0].target, 'fn-2');
});
