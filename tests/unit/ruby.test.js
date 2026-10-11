import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, rubyHtml, rubyReading, rubyPlain } from '../../js/ruby.js';

test('rubyHtml: {漢字|よみ} を <ruby> に変換する', () => {
  assert.equal(rubyHtml('{縄文|じょうもん}時代'), '<ruby>縄文<rt>じょうもん</rt></ruby>時代');
  assert.equal(
    rubyHtml('{古|ふる}い{順|じゅん}'),
    '<ruby>古<rt>ふる</rt></ruby>い<ruby>順<rt>じゅん</rt></ruby>',
  );
});

test('rubyHtml: ふりがな以外はHTMLエスケープされる', () => {
  assert.equal(rubyHtml('<b>&"\''), '&lt;b&gt;&amp;&quot;&#39;');
  assert.equal(rubyHtml('{<x>|"y"}'), '<ruby>&lt;x&gt;<rt>&quot;y&quot;</rt></ruby>');
});

test('rubyHtml: null/undefined/数値でも落ちない', () => {
  assert.equal(rubyHtml(undefined), '');
  assert.equal(rubyHtml(null), '');
  assert.equal(rubyHtml(123), '123');
});

test('rubyHtml: 記法になっていない括弧はそのまま残る', () => {
  assert.equal(rubyHtml('{abc}'), '{abc}');
  assert.equal(rubyHtml('{a|}'), '{a|}');
});

test('escapeHtml: 5種の文字', () => {
  assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(escapeHtml(5), '5');
});

test('rubyReading: 読み上げ用によみに置きかえる', () => {
  assert.equal(rubyReading('{卑弥呼|ひみこ}は{女王|じょおう}'), 'ひみこはじょおう');
  assert.equal(rubyReading(undefined), '');
});

test('rubyPlain: ふりがなを外す', () => {
  assert.equal(rubyPlain('{卑弥呼|ひみこ}は{女王|じょおう}'), '卑弥呼は女王');
  assert.equal(rubyPlain(null), '');
});

// ---- 読み上げ用（rubySpeech）----
import { rubySpeech, SPEECH_KANA_MIN } from '../../js/ruby.js';

test('rubySpeech: 3文字以上の漢字はよみに、2文字以下は漢字のまま', () => {
  assert.equal(SPEECH_KANA_MIN, 3);
  assert.equal(rubySpeech('{卑弥呼|ひみこ}は{女王|じょおう}'), 'ひみこは女王');
  assert.equal(rubySpeech('{縄文|じょうもん}{時代|じだい}'), '縄文時代');
  assert.equal(rubySpeech('{三内丸山遺跡|さんないまるやまいせき}'), 'さんないまるやまいせき');
  assert.equal(rubySpeech('{米|こめ}づくり'), '米づくり');
});

test('rubySpeech: 記法の外の文字・崩れた記法・空はそのまま', () => {
  assert.equal(rubySpeech('1{万|まん}6000{年|ねん}{前|まえ}！'), '1万6000年前！');
  assert.equal(rubySpeech('{abc}'), '{abc}');
  assert.equal(rubySpeech('<b>&'), '<b>&', '読み上げ用なのでHTMLエスケープしない');
  assert.equal(rubySpeech(undefined), '');
  assert.equal(rubySpeech(null), '');
  assert.equal(rubySpeech(''), '');
});

test('rubySpeech: 結果に { } | が残らない（全レベルのデータ）', async () => {
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  for (let lv = 1; lv <= 6; lv++) {
    const url = new URL(`../../data/levels/lv${lv}.js`, import.meta.url);
    if (!existsSync(fileURLToPath(url))) continue;
    const data = (await import(url)).default;
    for (const [era, st] of Object.entries(data)) {
      st.video.forEach((sc, i) => {
        assert.doesNotMatch(rubySpeech(sc.text), /[{}|]/, `lv${lv}.${era}.video[${i}]`);
      });
    }
  }
});

// BUG-013: 1〜2文字でも、ふつうの読み方とちがう歴史用語（王朝名・称号など）は漢字のままだと誤読される
test('rubySpeech: 特別な読み方の短い歴史用語は、よみで渡す', () => {
  const cases = [
    ['ヤマト{王権|おうけん}の「{大王|おおきみ}」', 'おおきみ'], // 漢字のままだと「だいおう」
    ['{明|みん}との{貿易|ぼうえき}', 'みん'],                  // 「めい」「あかり」
    ['{元|げん}の{大軍|たいぐん}', 'げん'],                     // 「もと」
    ['{百済|くだら}から{伝|つた}わった', 'くだら'],             // 「ひゃくさい」
    ['むらの{長|おさ}', 'おさ'],                                // 「なが」「ちょう」
    ['{清|しん}と{戦|たたか}った', 'しん'],                     // 「きよし」「せい」
  ];
  const bad = cases.filter(([src, yomi]) => !rubySpeech(src).includes(yomi)).map(([src]) => `${src} → ${rubySpeech(src)}`);
  assert.deepEqual(bad, []);
});

// BUG-013 の修正：必ずよみで読む語のリスト（SPEECH_YOMI_WORDS）
test('rubySpeech: リストの語はよみに、「漢字|よみ」の指定はそのよみのときだけ', async () => {
  const { SPEECH_YOMI_WORDS } = await import('../../js/ruby.js');
  assert.ok(SPEECH_YOMI_WORDS.has('大王'));
  assert.equal(rubySpeech('{唐|とう}の{都|みやこ}'), 'とうの都');
  assert.equal(rubySpeech('{倭|わ}の{奴国|なこく}'), 'わのなこく');
  assert.equal(rubySpeech('{信長|のぶなが}と{秀吉|ひでよし}'), 'のぶながとひでよし');
  assert.equal(rubySpeech('{原敬|はらたかし}'), 'はらたかし');
  // よみ指定つき：ほかのよみのときは漢字のまま
  assert.equal(rubySpeech('むらの{長|おさ}'), 'むらのおさ');
  assert.equal(rubySpeech('{長|なが}い'), '長い');
  assert.equal(rubySpeech('{明|みん}と{明|あか}るい'), 'みんと明るい');
  assert.equal(rubySpeech('{元|げん}の{元気|げんき}'), 'げんの元気');
  // ふつうの言葉は漢字のまま
  assert.equal(rubySpeech('{時代|じだい}の{米|こめ}と{土器|どき}'), '時代の米と土器');
});

test('rubySpeech: リストの語は全部データの中で使われている（書きまちがい防止）', async () => {
  const { SPEECH_YOMI_WORDS } = await import('../../js/ruby.js');
  const { readFileSync } = await import('node:fs');
  const used = new Set();
  for (let lv = 1; lv <= 6; lv++) {
    const src = readFileSync(new URL(`../../data/levels/lv${lv}.js`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\{([^{}|]+)\|([^{}|]+)\}/g)) { used.add(m[1]); used.add(`${m[1]}|${m[2]}`); }
  }
  assert.deepEqual([...SPEECH_YOMI_WORDS].filter((w) => !used.has(w)), []);
});
