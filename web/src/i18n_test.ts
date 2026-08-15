import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { REGISTRY } from '@zuform/core/registry';
import { TEMPLATES, USE_CASES } from '@zuform/core/templates';
import {
  CATEGORY_ORDER,
  categories,
  categoryLabel,
  LEVEL_EASY,
  levels,
  levelLabel,
  MESSAGES,
  serviceDescription,
  serviceDescriptions,
  t,
  templateDescription,
  templates,
  templateTitle,
  useCaseLabel,
  useCases,
} from './i18n.ts';
import type { Lang } from './i18n.ts';

const LANGS: Lang[] = ['ja', 'en'];

// ---------- 辞書のキー ----------

Deno.test('辞書: ja と en が完全に同じキーを持つ', () => {
  const jaKeys = Object.keys(MESSAGES.ja).sort();
  const enKeys = Object.keys(MESSAGES.en).sort();
  assertEquals(enKeys, jaKeys);
  assert(jaKeys.length > 0, '辞書が空になっている');
});

Deno.test('辞書: すべての値が文字列（未定義・null が混ざっていない）', () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(MESSAGES[lang])) {
      assertEquals(typeof value, 'string', `${lang}.${key} が文字列ではない`);
    }
  }
});

Deno.test('辞書: 日本語辞書に空文字の文言が無い（訳し忘れ検出）', () => {
  for (const [key, value] of Object.entries(MESSAGES.ja)) {
    assert(value !== '', `ja.${key} が空文字`);
  }
});

Deno.test('辞書: 英語の文言に日本語文字が混ざっていない（言語切替ラベルを除く）', () => {
  const japanese = /[ぁ-んァ-ヶ一-龥]/;
  for (const [key, value] of Object.entries(MESSAGES.en)) {
    // 'lang.toggleLabel' は「切り替え先の言語名」を出すため意図的に日本語
    if (key === 'lang.toggleLabel') continue;
    assert(!japanese.test(value), `en.${key} に日本語が残っている: ${value}`);
  }
});

// ---------- t() ----------

Deno.test('t(): 言語ごとの文言を返す', () => {
  assertEquals(t('ja', 'header.settings'), '設定');
  assertEquals(t('en', 'header.settings'), 'Settings');
});

Deno.test('t(): プレースホルダを展開する', () => {
  assertEquals(
    t('ja', 'toast.templateLoaded', { title: 'サーバーレスAPI' }),
    'テンプレート「サーバーレスAPI」を読み込みました',
  );
  assertEquals(
    t('en', 'toast.templateLoaded', { title: 'Serverless API' }),
    'Loaded the "Serverless API" template',
  );
});

Deno.test('t(): 数値のプレースホルダも文字列化して展開する', () => {
  assertEquals(
    t('en', 'toast.warningMany', { count: 3, message: 'unknown type' }),
    '3 warnings: unknown type and more',
  );
});

Deno.test('t(): 同じプレースホルダが複数あってもすべて置換する', () => {
  assertStringIncludes(t('en', 'code.hintsEmptyTitle', { env: 'DEV' }), 'DEV');
  assert(!t('en', 'code.hintsEmptyTitle', { env: 'DEV' }).includes('{env}'));
});

Deno.test('t(): 値を渡さなかったプレースホルダはそのまま残る（命名トークンの表示用）', () => {
  assertStringIncludes(t('en', 'settings.patternLabel'), '{project}');
  assertStringIncludes(t('ja', 'settings.patternError'), '{name}');
});

Deno.test('t(): vars 未指定でも例外にならない', () => {
  assertEquals(t('ja', 'header.clearAll'), '全消去');
});

// ---------- core 由来の対訳マップ ----------

Deno.test('対訳: serviceDescriptions が REGISTRY の全サービスを網羅する', () => {
  for (const service of REGISTRY) {
    const entry = serviceDescriptions[service.type];
    assert(entry !== undefined, `${service.type} の英訳が無い`);
    assert(entry.en !== '', `${service.type} の英訳が空`);
  }
  // 余分なキー（削除済みサービスの訳）が残っていないこと
  assertEquals(
    Object.keys(serviceDescriptions).sort(),
    REGISTRY.map((s) => s.type).sort(),
  );
});

Deno.test('対訳: categories が REGISTRY の全カテゴリを網羅する', () => {
  const used = [...new Set(REGISTRY.map((s) => s.category))].sort();
  assertEquals(Object.keys(categories).sort(), used);
});

Deno.test('対訳: CATEGORY_ORDER に全カテゴリが漏れなく並ぶ（パレットから消えない）', () => {
  const used = [...new Set(REGISTRY.map((s) => s.category))].sort();
  assertEquals([...CATEGORY_ORDER].sort(), used);
});

Deno.test('対訳: templates が TEMPLATES 全件を網羅する', () => {
  for (const template of TEMPLATES) {
    const entry = templates[template.id];
    assert(entry !== undefined, `${template.id} の英訳が無い`);
    assert(entry.title.en !== '', `${template.id} のタイトル英訳が空`);
    assert(entry.description.en !== '', `${template.id} の説明英訳が空`);
  }
  assertEquals(
    Object.keys(templates).sort(),
    TEMPLATES.map((template) => template.id).sort(),
  );
});

Deno.test('対訳: useCases が USE_CASES 全件を網羅する', () => {
  assertEquals(Object.keys(useCases).sort(), [...USE_CASES].sort());
});

Deno.test('対訳: levels が TEMPLATES で使われる全 level を網羅する', () => {
  const used = [...new Set(TEMPLATES.map((template) => template.level))];
  for (const level of used) {
    assert(levels[level] !== undefined, `level「${level}」の英訳が無い`);
  }
  // 難易度バッジの分岐に使う値が core 側に実在すること
  assert(used.includes(LEVEL_EASY as (typeof used)[number]), 'LEVEL_EASY が core の値と一致しない');
});

// ---------- 対訳のヘルパー ----------

Deno.test('ヘルパー: ja では core の文字列をそのまま返す', () => {
  const lambda = REGISTRY.find((s) => s.type === 'lambda')!;
  assertEquals(serviceDescription('ja', 'lambda', lambda.description), lambda.description);
  assertEquals(categoryLabel('ja', lambda.category), lambda.category);

  const template = TEMPLATES[0];
  assertEquals(templateTitle('ja', template.id, template.title), template.title);
  assertEquals(
    templateDescription('ja', template.id, template.description),
    template.description,
  );
  assertEquals(useCaseLabel('ja', template.useCase), template.useCase);
  assertEquals(levelLabel('ja', template.level), template.level);
});

Deno.test('ヘルパー: en では対訳へ差し替える', () => {
  const lambda = REGISTRY.find((s) => s.type === 'lambda')!;
  assertEquals(serviceDescription('en', 'lambda', lambda.description), 'Serverless function');
  assertEquals(categoryLabel('en', lambda.category), 'Compute');

  const template = TEMPLATES.find((tpl) => tpl.id === 'serverless-api')!;
  assertEquals(templateTitle('en', template.id, template.title), 'Serverless API');
  assertStringIncludes(
    templateDescription('en', template.id, template.description),
    'API Gateway + Lambda + DynamoDB',
  );
});

Deno.test('ヘルパー: 未知のキーは渡された日本語のままフォールバックする', () => {
  assertEquals(categoryLabel('en', '未知カテゴリ'), '未知カテゴリ');
  assertEquals(useCaseLabel('en', '未知用途'), '未知用途');
  assertEquals(levelLabel('en', '未知レベル'), '未知レベル');
  assertEquals(templateTitle('en', 'unknown-id', '未知テンプレート'), '未知テンプレート');
  assertEquals(templateDescription('en', 'unknown-id', '未知の説明'), '未知の説明');
});
