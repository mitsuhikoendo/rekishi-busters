export const LEVELS = [
  { lv: 1, title: 'ざっくり{時代|じだい}めぐり', desc: '{時代|じだい}の{名前|なまえ}と{順番|じゅんばん}をおぼえよう', icon: '🗺️', color: '#43a047' },
  { lv: 2, title: '{人物|じんぶつ}でつかむ', desc: 'その{時代|じだい}の{主人公|しゅじんこう}はだれ？', icon: '🧑‍🤝‍🧑', color: '#1e88e5' },
  { lv: 3, title: 'くらしと{文化|ぶんか}', desc: '{道具|どうぐ}・{建物|たてもの}・{人々|ひとびと}のくらし', icon: '🏠', color: '#fb8c00' },
  { lv: 4, title: '{政治|せいじ}としくみ', desc: 'だれが、どうやって{国|くに}をおさめた？', icon: '🏛️', color: '#8e24aa' },
  { lv: 5, title: '{世界|せかい}とのつながり', desc: '{外国|がいこく}とどう{関|かか}わってきた？', icon: '🌏', color: '#00acc1' },
  { lv: 6, title: 'つながりで{総|そう}まとめ', desc: '{原因|げんいん}と{結果|けっか}で{歴史|れきし}をつなげよう', icon: '🏆', color: '#e53935' },
];

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(lv) {
  return LEVELS.find((l) => l.lv === Number(lv));
}
