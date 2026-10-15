/**
 * What each plate says, for the legend that can be laid into the screen: the
 * lines Doré was illustrating, from public-domain English texts (Cary's
 * Dante, Tennyson, Milton, Poe, the English text of the Doré *Atala*), and a
 * short note tying the scene to its planet. The verse stays in English; the
 * notes follow the page's language.
 *
 * Every line was checked against the Project Gutenberg text it cites. An
 * ellipsis marks a cut, never a change.
 */

import type { Language } from '../../i18n/ui';

export interface Legend {
  source: string;
  verse: readonly string[];
  note: Record<Language, string>;
}

const CARY = 'tr. H. F. Cary';

export const LEGENDS: Record<string, Legend> = {
  saturn: {
    source: `Dante, Inferno I · ${CARY}`,
    verse: [
      '“…to lead me, where thou saidst,',
      'That I Saint Peter’s gate may view, and those',
      'Who as thou tell’st, are in such dismal plight.”',
      'Onward he mov’d, I close his steps pursu’d.',
    ],
    note: {
      en: 'Saturn is the slowest of the old planets, lord of lead, of age and of the long way round. The descent begins where Dante’s does: lost in a dark wood, following a guide downward.',
      zh: '土星是古代行星中最迟缓的一颗，掌管铅、衰老与漫长的迂回之路。这场下行从但丁的起点开始：迷失在幽暗的林中，跟着引路人向下走去。',
      ja: '土星は古い惑星のうち最も歩みの遅い星で、鉛と老いと長い回り道を司る。降下はダンテと同じ場所から始まる——暗い森に迷い、導き手の後について下へ。',
    },
  },
  'saturn-2': {
    source: `Dante, Inferno III · ${CARY}`,
    verse: [
      '“Through me you pass into the city of woe:',
      'Through me you pass into eternal pain:',
      'Through me among the people lost for aye.',
      '…',
      '“All hope abandon ye who enter here.”',
    ],
    note: {
      en: 'Saturn keeps thresholds, and the time that does not end. Here the road narrows to a gate in the rock, and the light stays behind on the far side of it.',
      zh: '土星守着门槛，也守着没有尽头的时间。路在这里收窄成岩石间的一道门，光留在了门的另一边。',
      ja: '土星は門口と、終わりのない時を守る。道はここで岩の門へと細まり、光は門の向こう側に取り残される。',
    },
  },
  'saturn-3': {
    source: 'Tennyson, Merlin and Vivien',
    verse: [
      'A storm was coming, but the winds were still,',
      'And in the wild woods of Broceliande,',
      'Before an oak, so hollow, huge and old',
      'It looked a tower of ivied masonwork,',
      'At Merlin’s feet the wily Vivien lay.',
    ],
    note: {
      en: 'Saturn rules old men, and the sleep that comes before a prison. Merlin, wisest of the court, will tell Vivien the charm, and the oak will close over him.',
      zh: '土星掌管老者，也掌管牢笼之前的那场沉睡。宫廷里最睿智的梅林终将把咒语告诉薇薇安，而这棵橡树会将他合拢其中。',
      ja: '土星は老人と、幽閉の前に訪れる眠りを司る。宮廷一の賢者マーリンはやがてヴィヴィアンに呪文を明かし、この樫の木が彼を閉じ込める。',
    },
  },
  jupiter: {
    source: 'Tennyson, The Marriage of Geraint',
    verse: [
      'Then rode Geraint into the castle court,',
      'His charger trampling many a prickly star',
      'Of sprouted thistle on the broken stones.',
      'He looked and saw that all was ruinous.',
    ],
    note: {
      en: 'Jupiter is the planet of kings, and of the welcome owed to a stranger. A ruined earl opens what is left of his house to a prince; the courtesy is all that still stands upright.',
      zh: '木星是君王之星，也是款待陌生人之礼的星。一位没落的伯爵向王子敞开他残存的家宅；唯一仍然挺立的，是这份礼节。',
      ja: '木星は王の星であり、旅人をもてなす礼の星でもある。落ちぶれた伯爵が、残された館を王子に開く。まっすぐ立っているのは、その礼節だけだ。',
    },
  },
  'jupiter-2': {
    source: `Dante, Inferno IV · ${CARY}`,
    verse: [
      '…We were not far',
      'On this side from the summit, when I kenn’d',
      'A flame, that o’er the darken’d hemisphere',
      'Prevailing shin’d.',
    ],
    note: {
      en: 'Jupiter grants honour, and in Limbo honour is what is left: the great poets and philosophers, unbaptised, keep a light of their own in the dark.',
      zh: '木星赐予荣耀；而在灵薄狱中，剩下的只有荣耀——那些未受洗的伟大诗人与哲人，在黑暗中守着自己的一点光。',
      ja: '木星は誉れを授ける。そして辺獄に残るのは誉れだけだ——洗礼を受けなかった偉大な詩人や哲人たちが、闇の中で自らの光を保っている。',
    },
  },
  'jupiter-3': {
    source: 'Tennyson, Merlin and Vivien',
    verse: [
      'At last they found—his foragers for charms—',
      'A little glassy-headed hairless man,',
      'Who lived alone in a great wild on grass;',
      'Read but one book, and ever reading grew',
      'So grated down and filed away with thought…',
    ],
    note: {
      en: 'Jupiter is also the planet of counsel and of books. A king’s men go down into the rock for the hermit who has read one book all his life, because only he can read the charm.',
      zh: '木星也是谏言与书卷之星。国王的人走进岩洞，去找那位一生只读一本书的隐士，因为只有他读得懂那道咒语。',
      ja: '木星は助言と書物の星でもある。王の手の者が岩の奥へ下りていくのは、生涯ただ一冊の書を読み続けた隠者を求めてのこと。その呪文を読めるのは彼だけなのだ。',
    },
  },
  mars: {
    source: 'Tennyson, Geraint and Enid',
    verse: [
      'Till his eye darkened and his helmet wagged;',
      'And at a sudden swerving of the road,',
      'Though happily down on a bank of grass,',
      'The Prince, without a word, from his horse fell.',
    ],
    note: {
      en: 'Mars rules iron and the wounds it makes. Geraint has ridden on with a lance-wound hidden under his armour, and the road has finally taken him off his horse.',
      zh: '火星掌管铁器，也掌管铁器留下的伤。杰兰特把枪伤藏在铠甲下一路骑行，终于在路的转弯处从马上跌落。',
      ja: '火星は鉄と、鉄がつける傷を司る。ゲラントは鎧の下に槍傷を隠したまま馬を進め、ついに道の曲がり目で落馬した。',
    },
  },
  'mars-2': {
    source: 'Tennyson, Merlin and Vivien',
    verse: [
      '…such fire for fame,',
      'Such trumpet-glowings in it, coming down',
      'To such a stern and iron-clashing close,',
      'That when he stopt we longed to hurl together…',
    ],
    note: {
      en: 'Mars is the song before the charge. In Merlin’s story a young knight sings of fame until the whole company wants to fight, and they ride all day through the dim land after a beast that will not be caught.',
      zh: '火星是冲锋前的那支歌。在梅林讲的故事里，一位年轻骑士唱起功名，唱得众人都想厮杀；他们便整日在昏暗的原野上，追逐一头永远追不上的兽。',
      ja: '火星は突撃の前の歌だ。マーリンの語る物語で、若い騎士が誉れを歌い、一同は戦いたくてたまらなくなる。そして一日中、薄暗い野を、決して捕まらない獣を追って駆けた。',
    },
  },
  'mars-3': {
    source: `Dante, Inferno III · ${CARY}`,
    verse: [
      '…Charon, demoniac form,',
      'With eyes of burning coal, collects them all,',
      'Beck’ning, and each, that lingers, with his oar',
      'Strikes.',
    ],
    note: {
      en: 'Mars is the ferryman’s anger. Charon’s eyes are coals, and whoever lingers on the shore he drives into the boat with his oar.',
      zh: '火星是摆渡人的怒火。卡戎的双眼如炭火，谁在岸边迟疑，他就用船桨把谁赶上船。',
      ja: '火星は渡し守の怒りだ。カロンの目は燃える炭火、岸でためらう者は櫂で打って舟へ追い立てる。',
    },
  },
  sun: {
    source: 'Chateaubriand, Atala · English text of the Doré edition',
    verse: [
      'Nevertheless, a bar of gold was forming in the east.',
      '… I took the body on my shoulders; the hermit walked in front of me, carrying a spade in his hand.',
    ],
    note: {
      en: 'The Sun rises on a burial. Chactas carries Atala down from the hermit’s grotto at first light, and the dawn is the only gold in the scene.',
      zh: '太阳升起在一场葬礼之上。破晓时分，夏克塔斯背着阿达拉从隐士的岩洞走下；晨光是这一幕里唯一的金色。',
      ja: '太陽は葬送の上に昇る。夜明け、シャクタスはアタラの亡骸を背に隠者の岩屋から下りていく。この場面で金色なのは、曙光だけだ。',
    },
  },
  'sun-2': {
    source: 'Milton, Paradise Lost III',
    verse: [
      '…and toward the coast of earth beneath,',
      'Down from the ecliptick, sped with hoped success,',
      'Throws his steep flight in many an aery wheel;',
      'Nor staid, till on Niphates’ top he lights.',
    ],
    note: {
      en: 'Satan has just talked his way past Uriel, the angel who stands in the Sun. Now he drops from the sun’s road toward the Earth, wheeling down through the light.',
      zh: '撒但刚刚骗过了站在太阳中的天使乌列。此刻他从太阳的轨道上俯冲向地球，在光中一圈圈盘旋而下。',
      ja: 'サタンは太陽に立つ天使ウリエルを言いくるめたばかりだ。いま彼は太陽の道から地球へと身を投げ、光の中を幾度も旋回しながら降りていく。',
    },
  },
  'sun-3': {
    source: `Dante, Purgatorio XII · ${CARY}`,
    verse: [
      'O fond Arachne! thee I also saw',
      'Half spider now in anguish crawling up',
      'Th’ unfinish’d web thou weaved’st to thy bane!',
    ],
    note: {
      en: 'The Sun is the planet of pride. On the terrace of the proud the pavement is carved with its examples, and Arachne, who challenged a goddess at the loom, is caught halfway into a spider.',
      zh: '太阳是骄傲之星。在骄傲者的平台上，地面刻满了骄傲的先例；敢在织机前挑战女神的阿拉克涅，被定格在半人半蛛之间。',
      ja: '太陽は傲慢の星だ。傲慢の者たちの環道では床に傲慢の例が刻まれ、機織りで女神に挑んだアラクネが、半ば蜘蛛となった姿で留められている。',
    },
  },
  venus: {
    source: 'Chateaubriand, Atala · English text of the Doré edition',
    verse: [
      'O my son, you should have seen the youthful savage and the old hermit, on their knees in front of each other, in the desert, digging with their hands a grave for the poor girl…',
    ],
    note: {
      en: 'Venus rules love and what it costs. Atala took poison rather than break the vow her mother had made for her, and the man who loved her digs her grave with his hands.',
      zh: '金星掌管爱，也掌管爱的代价。阿达拉宁可服毒，也不愿违背母亲替她许下的誓言；爱她的人用双手为她挖掘坟墓。',
      ja: '金星は愛と、その代償を司る。アタラは母が彼女のために立てた誓いを破るより毒をあおることを選び、彼女を愛した男がその墓を素手で掘る。',
    },
  },
  'venus-2': {
    source: `Dante, Inferno V · ${CARY}`,
    verse: [
      'A noise as of a sea in tempest torn',
      'By warring winds. The stormy blast of hell',
      'With restless fury drives the spirits on',
      'Whirl’d round and dash’d amain with sore annoy.',
    ],
    note: {
      en: 'Venus’s circle in Hell is a wind. The lovers who let desire steer them are blown for ever, and somewhere in the storm are Paolo and Francesca, still together.',
      zh: '金星在地狱中的那一层是一阵风。任由欲望驾驭的恋人永远被吹卷，风暴中某处，保罗与弗兰切斯卡依然相拥。',
      ja: '地獄における金星の圏は、一陣の風だ。欲望に舵を委ねた恋人たちは永遠に吹き流され、嵐のどこかにパオロとフランチェスカが、今も寄り添っている。',
    },
  },
  'venus-3': {
    source: 'Tennyson, Lancelot and Elaine',
    verse: [
      'Then rose the dumb old servitor, and the dead,',
      'Oared by the dumb, went upward with the flood—',
      'In her right hand the lily, in her left',
      'The letter—all her bright hair streaming down—',
    ],
    note: {
      en: 'Elaine loved Lancelot, who could not love her back, and asked to be sent to Camelot after her death with a letter in her hand. Venus here is the lily, and the river carrying it.',
      zh: '伊莲爱着无法回应她的兰斯洛特，临终前请求死后手持书信被送往卡美洛。金星在这里是那支百合，也是载着它的河流。',
      ja: 'エレインは応えてくれないランスロットを愛し、死後、手紙を握らせてキャメロットへ送ってほしいと願った。ここでの金星は、その百合と、それを運ぶ川だ。',
    },
  },
  mercury: {
    source: `Dante, Inferno II · ${CARY}`,
    verse: [
      'Now was the day departing, and the air,',
      'Imbrown’d with shadows, from their toils releas’d',
      'All animals on earth; and I alone',
      'Prepar’d myself the conflict to sustain…',
    ],
    note: {
      en: 'Mercury is the guide of souls. At dusk the whole world goes to rest except Dante, who is about to follow Virgil down.',
      zh: '水星是灵魂的引路者。黄昏时分，万物都歇息了，只有但丁没有——他即将跟随维吉尔向下走去。',
      ja: '水星は魂の導き手だ。夕暮れ、地上のすべてが憩いにつくなか、ダンテだけは違う。彼はこれからウェルギリウスの後について下りていく。',
    },
  },
  'mercury-2': {
    source: `Dante, Inferno I · ${CARY}`,
    verse: [
      'When him in that great desert I espied,',
      '“Have mercy on me!” cried I out aloud,',
      '“Spirit! or living man! what e’er thou be!”',
    ],
    note: {
      en: 'Before the guide there is the meeting. A figure comes out of the half-dark, faint from long silence, and turns out to be the poet Virgil, sent to lead the way.',
      zh: '引路之前，先有相遇。一个身影从昏暗中走出，因久未开口而声音微弱——原来是诗人维吉尔，奉命前来引路。',
      ja: '導きの前に、出会いがある。薄闇から現れた影は、長い沈黙のせいで声もかすれていた。それは道案内に遣わされた詩人ウェルギリウスだった。',
    },
  },
  'mercury-3': {
    source: `Dante, Purgatorio II · ${CARY}`,
    verse: [
      'As more and more toward us came, more bright',
      'Appear’d the bird of God, nor could the eye',
      'Endure his splendor near: I mine bent down.',
      '…',
      'The heav’nly steersman at the prow was seen…',
    ],
    note: {
      en: 'Mercury carries messages and souls. At the foot of Purgatory an angel ferries the newly dead across the sea, with nothing but his own wings for sail.',
      zh: '水星传递消息，也摆渡灵魂。在炼狱山脚，一位天使把新逝者渡过大海，他的双翼便是船帆。',
      ja: '水星は便りと魂を運ぶ。煉獄の麓で、天使が死者たちを乗せて海を渡る。帆の代わりは、彼自身の翼だ。',
    },
  },
  moon: {
    source: 'Poe, The Raven',
    verse: [
      '“Get thee back into the tempest and the Night’s Plutonian shore!',
      'Leave no black plume as a token of that lie thy soul hath spoken!',
    ],
    note: {
      en: 'The Moon rules night, tides and the things that come back. The narrator orders the raven out into the dark, and it does not move.',
      zh: '月亮掌管夜晚、潮汐，以及一切会归来的事物。叙述者命令渡鸦回到黑暗中去，而那只鸟纹丝不动。',
      ja: '月は夜と潮と、繰り返し戻ってくるものを司る。語り手は大鴉に闇へ帰れと命じるが、鳥は少しも動かない。',
    },
  },
  'moon-2': {
    source: 'Tennyson, Lancelot and Elaine',
    verse: [
      'For Arthur, long before they crowned him King,',
      'Roving the trackless realms of Lyonnesse,',
      'Had found a glen, gray boulder and black tarn.',
    ],
    note: {
      en: 'The Moon keeps what the day forgot. Before he was king, Arthur found the bones of a crowned king in a haunted glen, and took the nine diamonds of his crown, which became the prizes of Camelot’s jousts.',
      zh: '月亮保存白昼遗忘之物。在成为国王之前，亚瑟曾在一处闹鬼的幽谷中发现一位戴冠之王的遗骨，取下他王冠上的九颗钻石——后来它们成了卡美洛比武的奖品。',
      ja: '月は昼が忘れたものを覚えている。王となる以前、アーサーは呪われた谷で冠をいただいた王の骸を見つけ、その冠から九つのダイヤモンドを取った。それらは後にキャメロットの馬上槍試合の賞品となる。',
    },
  },
  'moon-3': {
    source: 'Poe, The Raven',
    verse: [
      '“Though thy crest be shorn and shaven, thou,” I said, “art sure no craven,',
      'Ghastly grim and ancient Raven wandering from the Nightly shore—',
      'Tell me what thy lordly name is on the Night’s Plutonian shore!”',
      'Quoth the Raven, “Nevermore.”',
    ],
    note: {
      en: 'The last level is a graveyard under the moon, with the raven crossing it. Here the descent turns around: one step further down is Saturn again.',
      zh: '最后一层是月下的墓园，渡鸦正从上空掠过。下行在这里折返：再往下一步，又是土星。',
      ja: '最後の階は月下の墓地で、大鴉がその上を横切っていく。降下はここで折り返す。次の一歩は、ふたたび土星だ。',
    },
  },
};
