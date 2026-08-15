/**
 * 全テンプレート × 全環境の Terraform コードをファイルに書き出す。
 * CIで `terraform validate` にかけて、生成コードの構文と参照整合性を検証する。
 *
 * 使い方: deno run -A scripts/emit_fixtures.ts [出力先ディレクトリ]
 */
import { generateForEnv } from '@zuform/core/generator';
import { TEMPLATES } from '@zuform/core/templates';
import { DEFAULT_NAMING, ENV_IDS } from '@zuform/core/types';

const outDir = Deno.args[0] ?? 'fixtures';
let count = 0;

for (const template of TEMPLATES) {
  for (const env of ENV_IDS) {
    const { code } = generateForEnv(template.nodes, template.edges, env, DEFAULT_NAMING);
    const dir = `${outDir}/${template.id}/${env}`;
    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeTextFile(`${dir}/main.tf`, code);
    count += 1;
  }
}

console.log(`${count} 個の main.tf を ${outDir}/ に出力しました`);
