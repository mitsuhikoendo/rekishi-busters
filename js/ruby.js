// {漢字|よみ} 形式のテキストを扱う。DOMに依存しないのでNodeのテストからも使える。
const RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 表示用HTML（ふりがな付き）
export function rubyHtml(text) {
  return escapeHtml(text ?? '').replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>');
}

// 読み上げ用（漢字をよみに置きかえる）
export function rubyReading(text) {
  return String(text ?? '').replace(RUBY_RE, '$2');
}

// ふりがなを外した表記
export function rubyPlain(text) {
  return String(text ?? '').replace(RUBY_RE, '$1');
}
