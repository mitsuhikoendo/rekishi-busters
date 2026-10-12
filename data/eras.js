// 14の時代。テキストは {漢字|よみ} 形式でふりがなを付ける。
export const ERAS = [
  {
    id: 'jomon', name: '{縄文|じょうもん}時代', short: '縄文', years: '約1万6000年前〜',
    color: '#8d6e4f', icon: '🏺',
    weapon: { name: '{石|いし}おの', emoji: '🪓' },
    characters: [
      { name: '{縄文|じょうもん}のりょうし', emoji: '🧔' },
      { name: '{土器|どき}づくり{名人|めいじん}', emoji: '👩' },
      { name: '{貝塚|かいづか}の{番人|ばんにん}', emoji: '🧓' },
      { name: '{丸木舟|まるきぶね}の{船頭|せんどう}', emoji: '🛶' },
    ],
  },
  {
    id: 'yayoi', name: '{弥生|やよい}時代', short: '弥生', years: '約2400年前〜',
    color: '#b5651d', icon: '🌾',
    weapon: { name: '{銅|どう}たくアタック', emoji: '🔔' },
    characters: [
      { name: '{卑弥呼|ひみこ}', emoji: '👸' },
      { name: 'むらの{長|おさ}', emoji: '🧔' },
      { name: '{米|こめ}づくり{名人|めいじん}', emoji: '🧑‍🌾' },
      { name: '{銅|どう}たく{職人|しょくにん}', emoji: '🛠️' },
    ],
  },
  {
    id: 'kofun', name: '{古墳|こふん}時代', short: '古墳', years: '3世紀ごろ〜',
    color: '#6b8e23', icon: '⛰️',
    weapon: { name: 'はにわミサイル', emoji: '🗿' },
    characters: [
      { name: '{大王|おおきみ}', emoji: '🤴' },
      { name: 'はにわ{職人|しょくにん}', emoji: '👨‍🔧' },
      { name: '{渡来人|とらいじん}', emoji: '👲' },
      { name: '{豪族|ごうぞく}のリーダー', emoji: '🗡️' },
    ],
  },
  {
    id: 'asuka', name: '{飛鳥|あすか}時代', short: '飛鳥', years: '592年〜',
    color: '#c2185b', icon: '🛕',
    weapon: { name: '{十七条|じゅうしちじょう}の{憲法|けんぽう}', emoji: '📜' },
    characters: [
      { name: '{聖徳太子|しょうとくたいし}', emoji: '🤴' },
      { name: '{中大兄皇子|なかのおおえのおうじ}', emoji: '🤺' },
      { name: '{中臣鎌足|なかとみのかまたり}', emoji: '🧔' },
      { name: '{小野妹子|おののいもこ}', emoji: '👨' },
    ],
  },
  {
    id: 'nara', name: '{奈良|なら}時代', short: '奈良', years: '710年〜',
    color: '#7b1fa2', icon: '🦌',
    weapon: { name: '{大仏|だいぶつ}ビーム', emoji: '✨' },
    characters: [
      { name: '{聖武天皇|しょうむてんのう}', emoji: '🤴' },
      { name: '{行基|ぎょうき}', emoji: '🧙' },
      { name: '{鑑真|がんじん}', emoji: '👴' },
      { name: '{防人|さきもり}', emoji: '💂' },
    ],
  },
  {
    id: 'heian', name: '{平安|へいあん}時代', short: '平安', years: '794年〜',
    color: '#e91e63', icon: '🎎',
    weapon: { name: 'かるたスラッシュ', emoji: '🎴' },
    characters: [
      { name: '{藤原道長|ふじわらのみちなが}', emoji: '🧔' },
      { name: '{紫式部|むらさきしきぶ}', emoji: '👩' },
      { name: '{清少納言|せいしょうなごん}', emoji: '👩‍🦰' },
      { name: '{平清盛|たいらのきよもり}', emoji: '👺' },
    ],
  },
  {
    id: 'kamakura', name: '{鎌倉|かまくら}時代', short: '鎌倉', years: '1185年ごろ〜',
    color: '#455a64', icon: '🏹',
    weapon: { name: '{弓矢|ゆみや}', emoji: '🏹' },
    characters: [
      { name: '{源頼朝|みなもとのよりとも}', emoji: '🤺' },
      { name: '{源義経|みなもとのよしつね}', emoji: '🥷' },
      { name: '{北条政子|ほうじょうまさこ}', emoji: '👩' },
      { name: '{北条時宗|ほうじょうときむね}', emoji: '🧔' },
    ],
  },
  {
    id: 'muromachi', name: '{室町|むろまち}時代', short: '室町', years: '1338年〜',
    color: '#00897b', icon: '🏯',
    weapon: { name: 'すみ{絵|え}の{筆|ふで}', emoji: '🖌️' },
    characters: [
      { name: '{足利義満|あしかがよしみつ}', emoji: '🤴' },
      { name: '{足利義政|あしかがよしまさ}', emoji: '🧔' },
      { name: '{雪舟|せっしゅう}', emoji: '👨‍🎨' },
      { name: '{観阿弥|かんあみ}', emoji: '🎭' },
    ],
  },
  {
    id: 'azuchi', name: '{安土桃山|あづちももやま}時代', short: '安土桃山', years: '1573年〜',
    color: '#d84315', icon: '⚔️',
    weapon: { name: '{鉄砲|てっぽう}', emoji: '🔫' },
    characters: [
      { name: '{織田信長|おだのぶなが}', emoji: '😠' },
      { name: '{豊臣秀吉|とよとみひでよし}', emoji: '🧔' },
      { name: '{明智光秀|あけちみつひで}', emoji: '🤺' },
      { name: 'フランシスコ・ザビエル', emoji: '🧑‍🦲' },
    ],
  },
  {
    id: 'edo', name: '{江戸|えど}時代', short: '江戸', years: '1603年〜',
    color: '#1565c0', icon: '🌊',
    weapon: { name: '{浮世絵|うきよえ}ウェーブ', emoji: '🌊' },
    characters: [
      { name: '{徳川家康|とくがわいえやす}', emoji: '🧔' },
      { name: '{徳川家光|とくがわいえみつ}', emoji: '🤴' },
      { name: '{伊能忠敬|いのうただたか}', emoji: '🚶' },
      { name: '{杉田玄白|すぎたげんぱく}', emoji: '👨‍⚕️' },
      { name: 'ペリー', emoji: '👨‍✈️' },
    ],
  },
  {
    id: 'meiji', name: '{明治|めいじ}時代', short: '明治', years: '1868年〜',
    color: '#5d4037', icon: '🚂',
    weapon: { name: '{蒸気機関車|じょうききかんしゃ}', emoji: '🚂' },
    characters: [
      { name: '{西郷隆盛|さいごうたかもり}', emoji: '🧔' },
      { name: '{大久保利通|おおくぼとしみち}', emoji: '🎩' },
      { name: '{伊藤博文|いとうひろぶみ}', emoji: '👨‍💼' },
      { name: '{福沢諭吉|ふくざわゆきち}', emoji: '👨‍🏫' },
      { name: '{板垣退助|いたがきたいすけ}', emoji: '🗣️' },
    ],
  },
  {
    id: 'taisho', name: '{大正|たいしょう}時代', short: '大正', years: '1912年〜',
    color: '#6a1b9a', icon: '📻',
    weapon: { name: 'ラジオ{電波|でんぱ}', emoji: '📻' },
    characters: [
      { name: '{野口英世|のぐちひでよ}', emoji: '🔬' },
      { name: '{平塚|ひらつか}らいてう', emoji: '👩' },
      { name: '{大正|たいしょう}のモガ', emoji: '💃' },
      { name: '{吉野作造|よしのさくぞう}', emoji: '📜' },
    ],
  },
  {
    id: 'showa', name: '{昭和|しょうわ}時代', short: '昭和', years: '1926年〜',
    color: '#c62828', icon: '🚄',
    weapon: { name: '{新幹線|しんかんせん}', emoji: '🚄' },
    characters: [
      { name: '{吉田茂|よしだしげる}', emoji: '👴' },
      { name: '{手塚治虫|てづかおさむ}', emoji: '✏️' },
      { name: '{昭和|しょうわ}の{家族|かぞく}', emoji: '👨‍👩‍👧' },
      { name: '{湯川秀樹|ゆかわひでき}', emoji: '🔬' },
    ],
  },
  {
    id: 'heisei', name: '{平成|へいせい}・{令和|れいわ}時代', short: '平成・令和', years: '1989年〜',
    color: '#0277bd', icon: '📱',
    weapon: { name: 'スマホフラッシュ', emoji: '📱' },
    characters: [
      { name: 'IT{社長|しゃちょう}', emoji: '👨‍💻' },
      { name: '{未来|みらい}ロボ', emoji: '🤖' },
      { name: 'ボランティア{隊長|たいちょう}', emoji: '🦺' },
      { name: '{宇宙飛行士|うちゅうひこうし}', emoji: '🧑‍🚀' },
    ],
  },
];

export const ERA_IDS = ERAS.map((e) => e.id);

export function getEra(id) {
  return ERAS.find((e) => e.id === id);
}
