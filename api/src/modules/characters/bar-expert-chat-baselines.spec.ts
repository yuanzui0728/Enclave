import * as fs from 'fs';
import * as path from 'path';

import { validateGeneratedSceneOutput } from '../ai/moment-output-validator';
import { buildBarExpertCharacter } from './bar-expert-character';
import { BAR_EXPERT_CHAT_BASELINES } from './bar-expert-chat-baselines';

type EvalDatasetManifestFixture = {
  id: string;
  caseIds: string[];
};

function readFixture<T>(relativePath: string): T {
  const filePath = path.resolve(__dirname, '../../../../', relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

describe('bar expert chat baselines', () => {
  it('keeps baseline sample ids and case ids unique', () => {
    expect(new Set(BAR_EXPERT_CHAT_BASELINES.map((item) => item.id)).size).toBe(
      BAR_EXPERT_CHAT_BASELINES.length,
    );
    expect(
      new Set(BAR_EXPERT_CHAT_BASELINES.map((item) => item.caseId)).size,
    ).toBe(BAR_EXPERT_CHAT_BASELINES.length);
  });

  it('covers every chat eval case with one baseline sample', () => {
    const manifest = readFixture<EvalDatasetManifestFixture>(
      'datasets/evals/manifests/bar-expert-chat.json',
    );

    expect(manifest.id).toBe('bar-expert-chat');
    expect(BAR_EXPERT_CHAT_BASELINES.map((item) => item.caseId).sort()).toEqual(
      [...manifest.caseIds].sort(),
    );
  });

  it('ships chat samples that pass the generic scene validator', () => {
    const character = buildBarExpertCharacter();
    const profile = character.profile;

    expect(profile).toBeDefined();

    for (const baseline of BAR_EXPERT_CHAT_BASELINES) {
      const result = validateGeneratedSceneOutput({
        text: baseline.text,
        profile: profile!,
        sceneKey: 'chat',
      });

      expect(result.valid).toBe(true);
      expect(result.reasons).toEqual([]);
    }
  });

  it('keeps the samples actionable, natural, and aligned with the role stance', () => {
    const firstDrinkBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-first-bar-low-pressure',
    );
    const menuTranslationBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-menu-translation-stirred-smoky',
    );
    const lowAbvBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-low-abv-chat-not-second-best',
    );
    const foodPairingBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-food-pairing-fried-snacks',
    );
    const barTypeBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-bar-type-date-night-quiet',
    );
    const budgetBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-budget-ordering-not-awkward',
    );
    const businessBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-business-round-dont-overdo',
    );
    const tasteShiftBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-taste-step-sideways-too-bitter',
    );
    const bridgeBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-beer-wine-bridge-to-cocktail',
    );
    const noAlcoholBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-no-alcohol-not-like-juice',
    );
    const limitedMenuBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) =>
        item.caseId === 'bar-expert-limited-menu-highball-house-special',
    );
    const avoidSourBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-avoid-sour-too-acidic',
    );
    const presenceBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-presence-not-proof',
    );
    const matureBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-mature-not-trying-too-hard',
    );
    const classicBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) =>
        item.caseId === 'bar-expert-classic-not-old-fashioned-or-bitter',
    );
    const professionalBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) =>
        item.caseId === 'bar-expert-professional-not-jargon-performance',
    );
    const particularBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-particular-not-difficult',
    );
    const elegantBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-elegant-not-sugary-photo-drink',
    );
    const specialBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-special-not-too-experimental',
    );
    const relaxedBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-relaxed-not-sloppy',
    );
    const ritualBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-ritual-not-fussy',
    );
    const assertiveBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-assertive-not-pushy',
    );
    const crispBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-crisp-not-harsh-cold',
    );
    const softBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-soft-not-mushy-sweet',
    );
    const livelyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-lively-not-too-loud',
    );
    const quietBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-quiet-not-boring',
    );
    const lightBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-light-not-thin-hollow',
    );
    const layeredBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-layered-not-heavy-oppressive',
    );
    const cleanBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-clean-not-sterile-alcohol-line',
    );
    const roundedBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-rounded-not-creamy-cloying',
    );
    const looseBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-loose-not-scattered-boneless',
    );
    const brightBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-bright-not-sharp-harsh',
    );
    const steadyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-steady-not-boring-too-safe',
    );
    const finishBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-finish-clean-not-thin-short',
    );
    const presenceBodyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-presence-not-too-full-heavy',
    );
    const thickBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-thick-not-dull-dragging',
    );
    const fineBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-fine-not-light-gripless',
    );
    const uprightBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-upright-not-hard-straight',
    );
    const plushBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-plush-not-sticky-muddy',
    );
    const silkyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-silky-not-oily-greasy',
    );
    const pillowyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-pillowy-not-dull-muted',
    );
    const bouncyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-bouncy-not-jumpy-sharp',
    );
    const suppleBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-supple-not-muddy-dragging',
    );
    const snappyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-snappy-not-thin-sharp',
    );
    const upliftedBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-uplifted-not-hard-harsh',
    );
    const openBrightBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-open-bright-not-floaty-hollow',
    );
    const tightBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-tight-not-tense-hard',
    );
    const relaxedRoundBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-relaxed-round-not-soft-flat',
    );
    const cleanCutBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-clean-cut-not-thin-cutting',
    );
    const helpFriendBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-help-friend-order-no-pressure',
    );
    const recoveryBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-first-drink-recovery-second-order',
    );
    const tipsyStopBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-tipsy-stop-gracefully',
    );
    const secondRoundBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-second-round-dont-push-night',
    );
    const safetyBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-drink-spiking-safety',
    );

    expect(firstDrinkBaseline?.text).toContain('第一杯');
    expect(firstDrinkBaseline?.text).toContain('bartender');
    expect(firstDrinkBaseline?.text).not.toMatch(/首先|其次|最后|总之/u);
    expect(firstDrinkBaseline?.text).not.toMatch(/风味轮|基酒知识|调酒理论/u);

    expect(menuTranslationBaseline?.text).toContain('按常见写法看');
    expect(menuTranslationBaseline?.text).toContain('stirred');
    expect(menuTranslationBaseline?.text).toContain('第一杯');
    expect(menuTranslationBaseline?.text).toMatch(/偏厚|偏苦|烟熏/u);
    expect(menuTranslationBaseline?.text).not.toMatch(/我知道这家店具体怎么做/u);

    expect(lowAbvBaseline?.text).toContain('不叫凑合');
    expect(lowAbvBaseline?.text).toMatch(/spritz|Americano/u);
    expect(lowAbvBaseline?.text).toContain('no-alcohol cocktail');
    expect(lowAbvBaseline?.text).not.toMatch(/不能喝才点|来 bar 还是得喝烈一点/u);

    expect(foodPairingBaseline?.text).toContain('炸鸡');
    expect(foodPairingBaseline?.text).toMatch(/Highball|Gin Rickey|spritz/u);
    expect(foodPairingBaseline?.text).toMatch(/清口|油感|收口干净/u);
    expect(foodPairingBaseline?.text).not.toMatch(/都可以|看你喜欢|随便点/u);

    expect(barTypeBaseline?.text).toContain('第一次单独约会');
    expect(barTypeBaseline?.text).toMatch(/能正常说话|灯光稳/u);
    expect(barTypeBaseline?.text).toMatch(/cocktail bar|aperitivo/u);
    expect(barTypeBaseline?.text).not.toMatch(/我知道这家店|这家一定适合/u);

    expect(budgetBaseline?.text).toContain('预算一般');
    expect(budgetBaseline?.text).toMatch(/Highball|Gin Rickey|Whisky Sour/u);
    expect(budgetBaseline?.text).toContain('bartender');
    expect(budgetBaseline?.text).not.toMatch(/没预算就别来|点最便宜的/u);

    expect(businessBaseline?.text).toContain('这种局里第一杯');
    expect(businessBaseline?.text).toMatch(/Highball|Gin & Tonic|Whisky Sour/u);
    expect(businessBaseline?.text).toMatch(/清爽|别太炸|不容易被酒精推太快/u);
    expect(businessBaseline?.text).not.toMatch(/最烈|最复杂|撑酒量/u);

    expect(tasteShiftBaseline?.text).toContain('不是你不适合');
    expect(tasteShiftBaseline?.text).toMatch(/Americano|spritz/u);
    expect(tasteShiftBaseline?.text).toMatch(/退半步|草本苦感/u);
    expect(tasteShiftBaseline?.text).not.toMatch(/多喝几次就习惯|你就是喝不来/u);

    expect(bridgeBaseline?.text).toMatch(/清爽|干净|收口快/u);
    expect(bridgeBaseline?.text).toMatch(/Highball|Gin Rickey|spritz/u);
    expect(bridgeBaseline?.text).toContain('bartender');
    expect(bridgeBaseline?.text).not.toMatch(/先从最厚的 stirred|直接上最烈/u);

    expect(noAlcoholBaseline?.text).toContain('无酒精');
    expect(noAlcoholBaseline?.text).toContain('bartender');
    expect(noAlcoholBaseline?.text).toMatch(/偏干|草本|别太甜/u);
    expect(noAlcoholBaseline?.text).toMatch(/tonic|tea-based|bitter soda/u);
    expect(noAlcoholBaseline?.text).not.toMatch(/随便点果汁|就点汽水/u);

    expect(limitedMenuBaseline?.text).toContain('house special');
    expect(limitedMenuBaseline?.text).toMatch(/highball|draft beer/u);
    expect(limitedMenuBaseline?.text).toContain('bartender');
    expect(limitedMenuBaseline?.text).not.toMatch(/这家 house special 一定|盲点 house special/u);

    expect(avoidSourBaseline?.text).toContain('不会喝');
    expect(avoidSourBaseline?.text).toMatch(/highball|Americano/u);
    expect(avoidSourBaseline?.text).toContain('bartender');
    expect(avoidSourBaseline?.text).toMatch(/别太酸|圆一点/u);
    expect(avoidSourBaseline?.text).not.toMatch(/继续点更酸的|再练几次 sour/u);

    const dateBalanceBaseline = BAR_EXPERT_CHAT_BASELINES.find(
      (item) => item.caseId === 'bar-expert-date-first-meeting-not-too-aggressive',
    );
    expect(dateBalanceBaseline?.text).toContain('第一次见面');
    expect(dateBalanceBaseline?.text).toContain('bartender');
    expect(dateBalanceBaseline?.text).toMatch(/Highball|Gin & Tonic|spritz/u);
    expect(dateBalanceBaseline?.text).toMatch(/轻一点|好聊天|压迫感/u);
    expect(dateBalanceBaseline?.text).not.toMatch(
      /攻击性越强越好|一上来就点最重|靠烟熏和烈度撑场/u,
    );

    expect(presenceBaseline?.text).toContain('有存在感');
    expect(presenceBaseline?.text).toContain('bartender');
    expect(presenceBaseline?.text).toMatch(/Gin & Tonic|Americano|highball/u);
    expect(presenceBaseline?.text).toMatch(/香气|收口|别太猛/u);
    expect(presenceBaseline?.text).not.toMatch(
      /直接上最烈|酒量硬撑|只有高酒精才有存在感/u,
    );

    expect(matureBaseline?.text).toContain('成熟一点');
    expect(matureBaseline?.text).toContain('bartender');
    expect(matureBaseline?.text).toMatch(
      /Whisky Highball|Americano|Gin & Tonic/u,
    );
    expect(matureBaseline?.text).toMatch(/利落|干净|克制一点/u);
    expect(matureBaseline?.text).not.toMatch(
      /背酒名|越苦越烈越成熟|把第一杯点成表演/u,
    );

    expect(classicBaseline?.text).toContain('经典一点');
    expect(classicBaseline?.text).toContain('bartender');
    expect(classicBaseline?.text).toMatch(
      /Whisky Highball|Daiquiri|Tom Collins/u,
    );
    expect(classicBaseline?.text).toMatch(/老派|不苦|别太厚/u);
    expect(classicBaseline?.text).not.toMatch(
      /只有 Old Fashioned 才算经典|先从最苦的经典酒开始|越老派越对/u,
    );

    expect(professionalBaseline?.text).toContain('专业一点');
    expect(professionalBaseline?.text).toContain('bartender');
    expect(professionalBaseline?.text).toMatch(/Daiquiri|Gin & Tonic/u);
    expect(professionalBaseline?.text).toMatch(/偏干|结构清楚|别太甜/u);
    expect(professionalBaseline?.text).not.toMatch(
      /术语越多越专业|背一串黑话|靠行话显得懂/u,
    );

    expect(particularBaseline?.text).toContain('讲究一点');
    expect(particularBaseline?.text).toContain('bartender');
    expect(particularBaseline?.text).toMatch(/平衡一点|偏干|收口利落/u);
    expect(particularBaseline?.text).toMatch(/经典方向|留给吧台|空间/u);
    expect(particularBaseline?.text).not.toMatch(
      /要求越细越讲究|提一长串|越挑剔越高级/u,
    );

    expect(elegantBaseline?.text).toContain('精致一点');
    expect(elegantBaseline?.text).toContain('bartender');
    expect(elegantBaseline?.text).toMatch(/French 75|spritz|Gin Rickey/u);
    expect(elegantBaseline?.text).toMatch(/清爽一点|别太甜|拍照酒/u);
    expect(elegantBaseline?.text).not.toMatch(
      /越甜越精致|糖浆感越满越好|只要好看就行/u,
    );

    expect(specialBaseline?.text).toContain('特别的');
    expect(specialBaseline?.text).toContain('bartender');
    expect(specialBaseline?.text).toMatch(
      /classic twist|seasonal sour|highball/u,
    );
    expect(specialBaseline?.text).toMatch(/基底清楚|别太实验|别太怪/u);
    expect(specialBaseline?.text).not.toMatch(
      /直接点最怪的|越实验越高级|盲冲 house special/u,
    );

    expect(relaxedBaseline?.text).toContain('松弛一点');
    expect(relaxedBaseline?.text).toContain('bartender');
    expect(relaxedBaseline?.text).toMatch(/Highball|Americano|spritz/u);
    expect(relaxedBaseline?.text).toMatch(/轻松|顺一点|别太随便/u);
    expect(relaxedBaseline?.text).not.toMatch(
      /随便来一杯|越淡越松弛|像软饮就行/u,
    );

    expect(ritualBaseline?.text).toContain('仪式感');
    expect(ritualBaseline?.text).toContain('bartender');
    expect(ritualBaseline?.text).toMatch(
      /French 75|Champagne highball|aperitivo spritz/u,
    );
    expect(ritualBaseline?.text).toMatch(/轻一点|别太累|别太隆重/u);
    expect(ritualBaseline?.text).not.toMatch(
      /越隆重越好|必须最复杂|越费力越有仪式感/u,
    );

    expect(assertiveBaseline?.text).toContain('有主见一点');
    expect(assertiveBaseline?.text).toContain('bartender');
    expect(assertiveBaseline?.text).toMatch(/偏干一点|基底清楚|别太甜/u);
    expect(assertiveBaseline?.text).toMatch(/状态最稳|选一个|咄咄逼人/u);
    expect(assertiveBaseline?.text).not.toMatch(
      /你就给我做|按我说的来|越强势越有主见/u,
    );

    expect(crispBaseline?.text).toContain('利落一点');
    expect(crispBaseline?.text).toContain('bartender');
    expect(crispBaseline?.text).toMatch(/Gin Rickey|Tom Collins|Daiquiri/u);
    expect(crispBaseline?.text).toMatch(/干净一点|收口|别太硬|别太冷/u);
    expect(crispBaseline?.text).not.toMatch(
      /越硬越利落|直接上最冷最硬的|越冷越高级/u,
    );

    expect(softBaseline?.text).toContain('柔和一点');
    expect(softBaseline?.text).toContain('bartender');
    expect(softBaseline?.text).toMatch(/Whisky Sour|Southside|Gin Sour/u);
    expect(softBaseline?.text).toMatch(/圆一点|顺一点|别太甜|别太软/u);
    expect(softBaseline?.text).not.toMatch(
      /越甜越柔和|奶油感越重越好|软到没骨架/u,
    );

    expect(livelyBaseline?.text).toContain('热闹一点');
    expect(livelyBaseline?.text).toContain('bartender');
    expect(livelyBaseline?.text).toMatch(/Paloma|Hugo spritz|Moscow Mule/u);
    expect(livelyBaseline?.text).toMatch(/活一点|别太甜|别太炸/u);
    expect(livelyBaseline?.text).not.toMatch(
      /越炸越好|越甜越热闹|直接上派对炸弹/u,
    );

    expect(quietBaseline?.text).toContain('安静一点');
    expect(quietBaseline?.text).toContain('bartender');
    expect(quietBaseline?.text).toMatch(/Americano|highball|aperitivo/u);
    expect(quietBaseline?.text).toMatch(/安静|收口|别太闷|存在感/u);
    expect(quietBaseline?.text).not.toMatch(
      /越闷越高级|最没存在感就行|随便点最平的/u,
    );

    expect(lightBaseline?.text).toContain('轻盈一点');
    expect(lightBaseline?.text).toContain('bartender');
    expect(lightBaseline?.text).toMatch(/Tom Collins|Gin Fizz|spritz/u);
    expect(lightBaseline?.text).toMatch(/轻盈|提一点|别太薄|别太空/u);
    expect(lightBaseline?.text).not.toMatch(
      /越薄越轻盈|最淡最像水就行|随便点最水的/u,
    );

    expect(layeredBaseline?.text).toContain('有层次一点');
    expect(layeredBaseline?.text).toContain('bartender');
    expect(layeredBaseline?.text).toMatch(/Bamboo|Adonis|Sherry Cobbler/u);
    expect(layeredBaseline?.text).toMatch(/层次|展开|别太重|别太压人/u);
    expect(layeredBaseline?.text).not.toMatch(
      /越重越有层次|直接上最厚最苦的|越压人越高级/u,
    );

    expect(cleanBaseline?.text).toContain('干净一点');
    expect(cleanBaseline?.text).toContain('bartender');
    expect(cleanBaseline?.text).toMatch(/Gin Sonic|Whisky Highball|Daiquiri/u);
    expect(cleanBaseline?.text).toMatch(/干净|线条|别太寡|酒精线条/u);
    expect(cleanBaseline?.text).not.toMatch(
      /越寡越干净|直接上最干最硬的 Martini|只剩酒精线条才高级/u,
    );

    expect(roundedBaseline?.text).toContain('圆润一点');
    expect(roundedBaseline?.text).toContain('bartender');
    expect(roundedBaseline?.text).toMatch(/Pisco Sour|Bee's Knees|Clover Club/u);
    expect(roundedBaseline?.text).toMatch(/圆润|顺一点|别太奶|别太腻/u);
    expect(roundedBaseline?.text).not.toMatch(
      /越奶越圆润|直接点奶油酒|越像甜品越好/u,
    );

    expect(looseBaseline?.text).toContain('松一点');
    expect(looseBaseline?.text).toContain('bartender');
    expect(looseBaseline?.text).toMatch(/Cynar & Soda|Sherry & Tonic|Bamboo Highball/u);
    expect(looseBaseline?.text).toMatch(/松|打开|别太散|骨架/u);
    expect(looseBaseline?.text).not.toMatch(
      /越散越松|直接点最水的 long drink|没骨架才轻松/u,
    );

    expect(brightBaseline?.text).toContain('亮一点');
    expect(brightBaseline?.text).toContain('bartender');
    expect(brightBaseline?.text).toMatch(/Southside|White Port & Tonic|Gin Highball/u);
    expect(brightBaseline?.text).toMatch(/亮|提一点|别太尖|别太冲/u);
    expect(brightBaseline?.text).not.toMatch(
      /越尖越亮|直接点最酸最冲的 sour|扎口才提神/u,
    );

    expect(steadyBaseline?.text).toContain('稳一点');
    expect(steadyBaseline?.text).toContain('bartender');
    expect(steadyBaseline?.text).toMatch(/Whisky Highball|Paloma|Tommy's Margarita/u);
    expect(steadyBaseline?.text).toMatch(/稳|好入口|别太无聊|保底/u);
    expect(steadyBaseline?.text).not.toMatch(
      /越保险越稳|直接点最无聊的|完全没表情才安全/u,
    );

    expect(finishBaseline?.text).toContain('收口利落一点');
    expect(finishBaseline?.text).toContain('bartender');
    expect(finishBaseline?.text).toMatch(/Americano|El Presidente|Bamboo/u);
    expect(finishBaseline?.text).toMatch(/收口|利落|别太薄|别太短/u);
    expect(finishBaseline?.text).not.toMatch(
      /越短越利落|直接点最薄的|空掉才算干净/u,
    );

    expect(presenceBodyBaseline?.text).toContain('有存在感一点');
    expect(presenceBodyBaseline?.text).toContain('bartender');
    expect(presenceBodyBaseline?.text).toMatch(/Americano|Campari & Soda|Paloma/u);
    expect(presenceBodyBaseline?.text).toMatch(/存在感|边缘|别太满|别太撑/u);
    expect(presenceBodyBaseline?.text).not.toMatch(
      /越满越有存在感|直接点最厚最撑的|压得住人才算立得住/u,
    );

    expect(thickBaseline?.text).toContain('厚一点');
    expect(thickBaseline?.text).toContain('bartender');
    expect(thickBaseline?.text).toMatch(/Martinez|Aged Rum Daiquiri|Perfect Manhattan/u);
    expect(thickBaseline?.text).toMatch(/厚|重量|别太闷|别太拖/u);
    expect(thickBaseline?.text).not.toMatch(
      /越甜越厚|直接点最闷最拖的|黏住不走才有内容/u,
    );

    expect(fineBaseline?.text).toContain('细一点');
    expect(fineBaseline?.text).toContain('bartender');
    expect(fineBaseline?.text).toMatch(/Tuxedo No.2|50\/50 Martini|White Negroni/u);
    expect(fineBaseline?.text).toMatch(/细|线条|别太轻|没抓手/u);
    expect(fineBaseline?.text).not.toMatch(
      /越轻越细|直接点最淡的|没抓手才显得精/u,
    );

    expect(uprightBaseline?.text).toContain('挺一点');
    expect(uprightBaseline?.text).toContain('bartender');
    expect(uprightBaseline?.text).toMatch(/50\/50 Martini|Bamboo|Reverse Manhattan/u);
    expect(uprightBaseline?.text).toMatch(/挺|骨架|别太硬|别太直/u);
    expect(uprightBaseline?.text).not.toMatch(
      /越硬越挺|直接点最直最硬的|没有缓冲才显得立/u,
    );

    expect(plushBaseline?.text).toContain('糯一点');
    expect(plushBaseline?.text).toContain('bartender');
    expect(plushBaseline?.text).toMatch(/Japanese Cocktail|Gold Rush|Sidecar/u);
    expect(plushBaseline?.text).toMatch(/糯|贴一点|别太黏|别太糊/u);
    expect(plushBaseline?.text).not.toMatch(
      /越黏越糯|直接点最甜最糊的|糊住才算有质地/u,
    );

    expect(silkyBaseline?.text).toContain('滑一点');
    expect(silkyBaseline?.text).toContain('bartender');
    expect(silkyBaseline?.text).toMatch(/White Lady|Silver Fizz|Pisco Sour/u);
    expect(silkyBaseline?.text).toMatch(/滑|顺一点|别太油|别太腻/u);
    expect(silkyBaseline?.text).not.toMatch(
      /越油越滑|直接点最腻的|挂口越久越顺/u,
    );

    expect(pillowyBaseline?.text).toContain('绵一点');
    expect(pillowyBaseline?.text).toContain('bartender');
    expect(pillowyBaseline?.text).toMatch(/Ramos Gin Fizz|Clover Club|Whisky Sour/u);
    expect(pillowyBaseline?.text).toMatch(/绵|蓬一点|别太钝|别太闷/u);
    expect(pillowyBaseline?.text).not.toMatch(
      /越奶越绵|直接点最厚最闷的|像甜品一样才算软/u,
    );

    expect(bouncyBaseline?.text).toContain('弹一点');
    expect(bouncyBaseline?.text).toContain('bartender');
    expect(bouncyBaseline?.text).toMatch(/Gin Sonic|Ranch Water|Gin Fizz/u);
    expect(bouncyBaseline?.text).toMatch(/弹|提一点|别太跳|别太尖/u);
    expect(bouncyBaseline?.text).not.toMatch(
      /越炸越弹|直接点最冲的|扎口越狠越有精神/u,
    );

    expect(suppleBaseline?.text).toContain('润一点');
    expect(suppleBaseline?.text).toContain('bartender');
    expect(suppleBaseline?.text).toMatch(/Tommy's Margarita|Eastside|White Lady/u);
    expect(suppleBaseline?.text).toMatch(/润|顺一点|别太糊|别太拖/u);
    expect(suppleBaseline?.text).not.toMatch(
      /越黏越润|直接点最厚最拖的|挂得越久越有质感/u,
    );

    expect(snappyBaseline?.text).toContain('脆一点');
    expect(snappyBaseline?.text).toContain('bartender');
    expect(snappyBaseline?.text).toMatch(/Whisky Highball|Gin Buck|Paloma/u);
    expect(snappyBaseline?.text).toMatch(/脆|咬口|别太薄|别太尖/u);
    expect(snappyBaseline?.text).not.toMatch(
      /越薄越脆|直接点最酸最尖的|刮嘴才显得有精神/u,
    );

    expect(upliftedBaseline?.text).toContain('挺拔一点');
    expect(upliftedBaseline?.text).toContain('bartender');
    expect(upliftedBaseline?.text).toMatch(/Gin & Tonic|White Port & Tonic|Bamboo Highball/u);
    expect(upliftedBaseline?.text).toMatch(/挺拔|往上提|别太硬|别太冲/u);
    expect(upliftedBaseline?.text).not.toMatch(
      /越硬越挺拔|直接点最烈最冲的|顶脸才算有骨架/u,
    );

    expect(openBrightBaseline?.text).toContain('松亮一点');
    expect(openBrightBaseline?.text).toContain('bartender');
    expect(openBrightBaseline?.text).toMatch(/Aperol Spritz|White Port & Tonic|Sherry & Tonic/u);
    expect(openBrightBaseline?.text).toMatch(/松亮|打开一点|别太飘|别太空/u);
    expect(openBrightBaseline?.text).not.toMatch(
      /越空越松亮|直接点最像气泡水的|飘着没中段才轻松/u,
    );

    expect(tightBaseline?.text).toContain('紧一点');
    expect(tightBaseline?.text).toContain('bartender');
    expect(tightBaseline?.text).toMatch(/Daiquiri|Tommy's Margarita|Bamboo/u);
    expect(tightBaseline?.text).toMatch(/紧|收一点|别太绷|别太硬/u);
    expect(tightBaseline?.text).not.toMatch(
      /越硬越紧|直接点最烈最绷的|绷到顶脸才显得利落/u,
    );

    expect(relaxedRoundBaseline?.text).toContain('松弛圆一点');
    expect(relaxedRoundBaseline?.text).toContain('bartender');
    expect(relaxedRoundBaseline?.text).toMatch(/Adonis|Sherry Cobbler|Americano/u);
    expect(relaxedRoundBaseline?.text).toMatch(/松弛圆|顺一点|别太软|别太塌/u);
    expect(relaxedRoundBaseline?.text).not.toMatch(
      /越软越松弛|直接点最甜最塌的|塌下去才显得放松/u,
    );

    expect(cleanCutBaseline?.text).toContain('干脆一点');
    expect(cleanCutBaseline?.text).toContain('bartender');
    expect(cleanCutBaseline?.text).toMatch(/Gin Sonic|Bamboo|El Presidente/u);
    expect(cleanCutBaseline?.text).toMatch(/干脆|干净一点|别太薄|别太利/u);
    expect(cleanCutBaseline?.text).not.toMatch(
      /越薄越干脆|直接点最利最削的|像刀口一样才算干脆/u,
    );

    expect(helpFriendBaseline?.text).toContain('朋友第一次来');
    expect(helpFriendBaseline?.text).toContain('bartender');
    expect(helpFriendBaseline?.text).toMatch(/清一点|不苦|酒精感别太重/u);
    expect(helpFriendBaseline?.text).not.toMatch(
      /鼓励你替他装懂|直接给他上最重|展示型点法/u,
    );

    expect(recoveryBaseline?.text).toContain('不用硬撑着喝完');
    expect(recoveryBaseline?.text).toContain('bartender');
    expect(recoveryBaseline?.text).toMatch(/不对口|别这么苦|别这么甜|别这么重/u);
    expect(recoveryBaseline?.text).not.toMatch(/硬喝完|都是 bartender 的问题/u);

    expect(tipsyStopBaseline?.text).toContain('别再继续加酒');
    expect(tipsyStopBaseline?.text).toContain('bartender');
    expect(tipsyStopBaseline?.text).toMatch(/水|不带酒精|别太甜/u);
    expect(tipsyStopBaseline?.text).not.toMatch(
      /建议你继续跟一杯|鼓励你硬撑/u,
    );

    expect(secondRoundBaseline?.text).toContain('第二杯');
    expect(secondRoundBaseline?.text).toMatch(/平着走|往下收/u);
    expect(secondRoundBaseline?.text).toMatch(/highball|spritz|Americano/u);
    expect(secondRoundBaseline?.text).not.toMatch(/更烈|更重|上强度/u);

    expect(safetyBaseline?.text).toContain('先别让她再喝');
    expect(safetyBaseline?.text).toContain('留着');
    expect(safetyBaseline?.text).toMatch(/店员|安保/u);
    expect(safetyBaseline?.text).toMatch(/急救|送医/u);
    expect(safetyBaseline?.text).not.toMatch(/再观察一会|继续喝完|应该只是酒量差/u);
  });
});
