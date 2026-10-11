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
