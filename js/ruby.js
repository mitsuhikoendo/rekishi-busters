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

// 自然に読み上げるためのテキスト。
// ひらがなだけにすると語の切れ目やアクセントが失われてぎこちなくなるので、ふつうは漢字のまま渡す。
// 3文字以上の漢字（人名・歴史用語など読みまちがえやすい語）と、下のリストの語だけ、よみに置きかえる。
export const SPEECH_KANA_MIN = 3;

// 1〜2文字でも、ふつうの読み方とちがうので必ずよみで読む語。
// 「漢字」だけならその語はいつも、「漢字|よみ」ならそのよみのときだけ（{長|なが}い などは漢字のまま）。
export const SPEECH_YOMI_WORDS = new Set([
  // 称号・しくみ・ことば
  '大王', '長|おさ', '租', '庸', '調|ちょう', '律', '令|りょう', '政|まつり', '防人', '公家', '外様',
  '館|やかた', '町衆', '銅|どう', '処|ところ', '日出', '日没', '上|かみ', '下|しも', '剋', '天|あま', '首|しゅ', '氏|し',
  // 国・王朝
  '明|みん', '明銭', '元|げん', '元寇', '元軍', '宋', '宋銭', '唐', '隋', '魏', '漢', '清|しん',
  '倭', '倭人', '倭寇', '百済', '奴国', '北京', '漢城',
  // 人名・地名
  '信長', '秀吉', '家康', '光秀', '尊氏', '頼朝', '義経', '義満', '義政', '道真', '道長', '鎌足', '原敬',
  '阿国', '行基', '鑑真', '運慶', '快慶', '雪舟', '法然', '親鸞', '北斎', '広重', '空海', '備中', '堺',
]);

function speakAsYomi(base, yomi) {
  return base.length >= SPEECH_KANA_MIN || SPEECH_YOMI_WORDS.has(base) || SPEECH_YOMI_WORDS.has(`${base}|${yomi}`);
}

export function rubySpeech(text) {
  return String(text ?? '').replace(RUBY_RE, (_, base, yomi) => (speakAsYomi(base, yomi) ? yomi : base));
}

// ふりがなを外した表記
export function rubyPlain(text) {
  return String(text ?? '').replace(RUBY_RE, '$1');
}
