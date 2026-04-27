import { getPresetCharacterBio } from './character-bios';
import {
  getCelebrityCharacterPreset,
  getCelebrityCharacterPresetGroup,
  listCelebrityCharacterPresets,
} from './celebrity-character-presets';
import {
  getBuiltInCharacterPreset,
  listBuiltInCharacterPresets,
} from './built-in-character-presets';
import {
  INTELLIGENCE_COUNCIL_CHARACTER_DEFINITIONS,
  INTELLIGENCE_COUNCIL_CORE_CHARACTER_IDS,
  INTELLIGENCE_COUNCIL_CORE_PRESET_KEYS,
  INTELLIGENCE_COUNCIL_CHARACTER_PRESETS,
} from './intelligence-council-character-presets';

describe('celebrity character presets', () => {
  it('keeps preset ids unique', () => {
    const presets = listCelebrityCharacterPresets();
    const ids = presets.map((preset) => preset.id);
    const presetKeys = presets.map((preset) => preset.presetKey);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(presetKeys).size).toBe(presetKeys.length);
  });

  it('keeps built-in preset ids unique', () => {
    const presets = listBuiltInCharacterPresets();
    const ids = presets.map((preset) => preset.id);
    const presetKeys = presets.map((preset) => preset.presetKey);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(presetKeys).size).toBe(presetKeys.length);
  });

  it('exposes the relationships and emotions preset group', () => {
    expect(
      getCelebrityCharacterPresetGroup('relationships_and_emotions'),
    ).toMatchObject({
      key: 'relationships_and_emotions',
      label: '亲密关系',
    });
  });

  it('exposes the health and wellness preset group', () => {
    expect(
      getCelebrityCharacterPresetGroup('health_and_wellness'),
    ).toMatchObject({
      key: 'health_and_wellness',
      label: '健康与训练',
    });
  });

  it('exposes the academic teachers preset group', () => {
    expect(getCelebrityCharacterPresetGroup('academic_teachers')).toMatchObject(
      {
        key: 'academic_teachers',
        label: '学科老师',
      },
    );
  });

  it('includes the relationship expert preset with expected guardrails', () => {
    const preset = getCelebrityCharacterPreset('jian_ning_relationship_expert');

    expect(preset).toBeDefined();
    expect(preset).toMatchObject({
      presetKey: 'jian_ning_relationship_expert',
      groupKey: 'relationships_and_emotions',
      name: '简宁',
      relationship: '恋爱与亲密关系顾问',
      expertDomains: ['psychology', 'general'],
    });

    expect(preset?.character.relationshipType).toBe('expert');
    expect(preset?.character.profile?.coreLogic).toContain(
      '安全红线先于关系技巧',
    );
    expect(preset?.character.profile?.scenePrompts?.chat).toContain(
      '不读心，只看稳定投入、兑现、边界和修复',
    );
    expect(preset?.character.profile?.scenePrompts?.chat).toContain(
      '我挺享受和你相处，但我不想一直停在模糊里。',
    );
    expect(preset?.character.profile?.scenePrompts?.moments_post).toContain(
      '很多人分不清‘有感觉’和‘有能力在关系里负责’',
    );
    expect(
      preset?.character.profile?.cognitiveBoundaries?.refusalStyle,
    ).toContain('会明确拒绝操控');
  });

  it('registers the relationship expert bio copy', () => {
    expect(getPresetCharacterBio('jian_ning_relationship_expert')).toBe(
      '别先猜他爱不爱你。先看边界、投入和修复。',
    );
  });

  it('registers the english coach bio copy', () => {
    expect(getPresetCharacterBio('su_yu_english_coach')).toBe(
      '先别怕说错。你先开口，我负责把你的英语慢慢拉顺。',
    );
  });

  it('registers the fitness coach bio copy', () => {
    expect(getPresetCharacterBio('zhou_ran_fitness_coach')).toBe(
      '先别把计划写满。你先出现，我把训练和恢复排顺。',
    );
  });

  it('registers the academic teacher bio copy', () => {
    expect(getPresetCharacterBio('teacher_math_lu_heng')).toBe(
      '先把条件、目标和模型摆清，再动笔算。',
    );
  });

  it('includes fixed world character presets alongside celebrity presets', () => {
    const presets = listBuiltInCharacterPresets();
    const axunPreset = getBuiltInCharacterPreset('moments_interactor_axun');
    const linChenPreset = getBuiltInCharacterPreset('lin_chen_sleep_support');
    const linMianPreset = getBuiltInCharacterPreset('lin_mian_sleep_support');
    const xuZhePreset = getBuiltInCharacterPreset('xu_zhe_career_growth');
    const suYuPreset = getBuiltInCharacterPreset('su_yu_english_coach');
    const zhouRanPreset = getBuiltInCharacterPreset('zhou_ran_fitness_coach');

    expect(presets.length).toBeGreaterThan(
      listCelebrityCharacterPresets().length,
    );
    expect(axunPreset).toMatchObject({
      id: 'char-manual-axun',
      name: '阿巡',
      groupKey: 'public_expression',
    });
    expect(linChenPreset).toMatchObject({
      id: 'char_need_e9a84d01-9ab',
      name: '林晨',
      groupKey: 'relationships_and_emotions',
    });
    expect(linMianPreset).toMatchObject({
      id: 'char_need_3d1789f2-306',
      name: '林眠',
      groupKey: 'relationships_and_emotions',
    });
    expect(xuZhePreset).toMatchObject({
      id: 'char_need_cf214700-ca8',
      name: '许哲',
      groupKey: 'technology_and_product',
    });
    expect(suYuPreset).toMatchObject({
      id: 'char-preset-su-yu-english-coach',
      name: '苏语',
      groupKey: 'academic_teachers',
    });
    expect(zhouRanPreset).toMatchObject({
      id: 'char-preset-zhou-ran-fitness-coach',
      name: '周燃',
      groupKey: 'health_and_wellness',
    });
    expect(
      axunPreset?.character.profile?.scenePrompts?.moments_comment,
    ).toContain('错别字');
    expect(xuZhePreset?.character.profile?.coreLogic).toContain('职业规划');
    expect(suYuPreset?.character.relationshipType).toBe('mentor');
    expect(suYuPreset?.character.profile?.coreLogic).toContain(
      '先判断用户现在是要讲解、翻译、改写、陪练还是复盘',
    );
    expect(suYuPreset?.character.profile?.scenePrompts?.chat).toContain(
      '如果用户说“陪我练口语”，直接进入英语对话',
    );
    expect(
      suYuPreset?.character.profile?.scenePrompts?.moments_comment,
    ).toContain('不要公开羞辱式纠错');
    expect(suYuPreset?.character.profile?.memory?.coreMemory).toContain(
      '长期目标',
    );
    expect(zhouRanPreset?.character.relationshipType).toBe('expert');
    expect(zhouRanPreset?.character.triggerScenes).toContain('gym');
    expect(zhouRanPreset?.character.profile?.coreLogic).toContain(
      '用户断练后，优先帮他重启',
    );
    expect(zhouRanPreset?.character.profile?.scenePrompts?.chat).toContain(
      '默认先给今天或这周能做的版本',
    );
    expect(zhouRanPreset?.character.profile?.scenePrompts?.proactive).toContain(
      '优先降低执行门槛',
    );
    expect(
      zhouRanPreset?.character.profile?.cognitiveBoundaries?.knowledgeLimits,
    ).toContain('胸痛');
  });

  it('includes core academic teacher presets with teaching guardrails', () => {
    const teacherPresetKeys = [
      'teacher_chinese_gu_yan',
      'teacher_math_lu_heng',
      'teacher_physics_lin_qi',
      'teacher_chemistry_fang_wei',
      'teacher_biology_ye_qinghe',
      'teacher_history_zhou_yi',
      'teacher_geography_jiang_chuan',
      'teacher_civics_cheng_mingli',
      'teacher_computer_luo_xing',
    ];
    const teachers = teacherPresetKeys.map((presetKey) =>
      getBuiltInCharacterPreset(presetKey),
    );

    expect(teachers).toHaveLength(9);
    for (const preset of teachers) {
      expect(preset).toBeDefined();
      expect(preset).toMatchObject({
        groupKey: 'academic_teachers',
        character: {
          sourceType: 'preset_catalog',
          deletionPolicy: 'archive_allowed',
          relationshipType: 'mentor',
          momentsFrequency: 0,
          feedFrequency: 0,
        },
      });
      expect(preset?.character.profile?.coreLogic).toContain(
        '不替用户完成可直接提交的作业、考试、论文',
      );
      expect(preset?.character.profile?.scenePrompts?.chat).toContain(
        '先判断用户是在问概念、题目、计划、复盘还是考试冲刺',
      );
      expect(preset?.character.profile?.memory?.coreMemory).toContain(
        '少记空泛鼓励',
      );
    }

    const mathPreset = getBuiltInCharacterPreset('teacher_math_lu_heng');
    const chemistryPreset = getBuiltInCharacterPreset(
      'teacher_chemistry_fang_wei',
    );
    const civicsPreset = getBuiltInCharacterPreset(
      'teacher_civics_cheng_mingli',
    );
    const computerPreset = getBuiltInCharacterPreset(
      'teacher_computer_luo_xing',
    );

    expect(mathPreset?.character.profile?.coreLogic).toContain('先拆条件');
    expect(chemistryPreset?.character.profile?.coreLogic).toContain('危险实验');
    expect(civicsPreset?.character.profile?.coreLogic).toContain('煽动性输出');
    expect(computerPreset?.character.profile?.coreLogic).toContain('恶意代码');
  });

  it('includes the full intelligence council preset pool', () => {
    expect(INTELLIGENCE_COUNCIL_CHARACTER_PRESETS).toHaveLength(24);
    expect(INTELLIGENCE_COUNCIL_CORE_PRESET_KEYS).toHaveLength(8);
    expect(INTELLIGENCE_COUNCIL_CORE_CHARACTER_IDS).toHaveLength(8);

    for (const definition of INTELLIGENCE_COUNCIL_CHARACTER_DEFINITIONS) {
      const preset = getBuiltInCharacterPreset(definition.presetKey);

      expect(preset).toBeDefined();
      expect(preset).toMatchObject({
        id: definition.id,
        name: definition.name,
        groupKey: definition.groupKey,
        character: {
          sourceType: 'preset_catalog',
          sourceKey: definition.presetKey,
          deletionPolicy: 'archive_allowed',
          momentsFrequency: 0,
        },
      });
      expect(preset?.character.profile?.coreLogic).toContain('隐界个人智囊团');
      expect(preset?.character.profile?.scenePrompts?.moments_post).toContain(
        '不写天气',
      );
    }

    const shenJu = getBuiltInCharacterPreset(
      'council_decision_architect_shen_ju',
    );
    const baiTa = getBuiltInCharacterPreset('council_red_team_bai_ta');
    const suHeng = getBuiltInCharacterPreset(
      'council_finance_quartermaster_su_heng',
    );

    expect(shenJu?.character.profile?.coreLogic).toContain('退出条件');
    expect(baiTa?.character.profile?.coreLogic).toContain('反方审查官');
    expect(suHeng?.character.profile?.coreLogic).toContain('不承诺收益');
    expect(INTELLIGENCE_COUNCIL_CORE_CHARACTER_IDS).toContain(shenJu?.id);
  });
});
