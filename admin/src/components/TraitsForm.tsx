import { Form, Input, Select, Radio, Collapse, Switch, Slider } from 'antd';

const { TextArea } = Input;

export default function TraitsForm() {
  return (
    <>
      <Form.Item label="角色核心人设" name="basePrompt">
        <TextArea rows={4} placeholder="描述角色的身份、背景和核心设定..." />
      </Form.Item>

      <Form.Item label="说话习惯" name={['profile', 'traits', 'speechPatterns']}>
        <Select mode="tags" placeholder="输入后回车添加，如：喜欢引用法条" />
      </Form.Item>

      <Form.Item label="口头禅" name={['profile', 'traits', 'catchphrases']}>
        <Select mode="tags" placeholder="输入后回车添加，如：根据相关法规" />
      </Form.Item>

      <Form.Item label="常聊话题" name={['profile', 'traits', 'topicsOfInterest']}>
        <Select mode="tags" placeholder="输入后回车添加，如：法律案例" />
      </Form.Item>

      <Form.Item label="情感基调" name={['profile', 'traits', 'emotionalTone']}>
        <Input placeholder="一句话描述，如：严谨务实，偶尔幽默" />
      </Form.Item>

      <Form.Item label="回复长度" name={['profile', 'traits', 'responseLength']}>
        <Radio.Group>
          <Radio value="short">简短</Radio>
          <Radio value="medium">适中</Radio>
          <Radio value="long">详细</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item label="Emoji 使用" name={['profile', 'traits', 'emojiUsage']}>
        <Radio.Group>
          <Radio value="none">不用</Radio>
          <Radio value="occasional">偶尔</Radio>
          <Radio value="frequent">频繁</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item label="长期记忆摘要（旧）" name={['profile', 'memorySummary']}>
        <TextArea rows={2} placeholder="兼容旧数据，新角色请使用下方「记忆与推理」面板" />
      </Form.Item>

      <Collapse style={{ marginTop: 16 }} items={[
        {
          key: 'identity',
          label: '深度人格',
          children: (
            <>
              <Form.Item label="职业/身份" name={['profile', 'identity', 'occupation']}>
                <Input placeholder="如：资深律师、心理咨询师" />
              </Form.Item>
              <Form.Item label="背景故事" name={['profile', 'identity', 'background']}>
                <TextArea rows={3} placeholder="角色的成长经历、重要事件..." />
              </Form.Item>
              <Form.Item label="核心动机/价值观" name={['profile', 'identity', 'motivation']}>
                <Input placeholder="如：追求公平正义，帮助弱势群体" />
              </Form.Item>
              <Form.Item label="世界观" name={['profile', 'identity', 'worldview']}>
                <Input placeholder="如：理性主义者，相信规则的力量" />
              </Form.Item>
              <Form.Item label="工作/思考方式" name={['profile', 'behavioralPatterns', 'workStyle']}>
                <Input placeholder="如：逻辑严密，喜欢列举证据" />
              </Form.Item>
              <Form.Item label="社交风格" name={['profile', 'behavioralPatterns', 'socialStyle']}>
                <Input placeholder="如：初见保持距离，熟悉后很热情" />
              </Form.Item>
              <Form.Item label="语言/行为禁忌" name={['profile', 'behavioralPatterns', 'taboos']}>
                <Select mode="tags" placeholder="输入后回车添加，如：不说脏话" />
              </Form.Item>
              <Form.Item label="个人癖好" name={['profile', 'behavioralPatterns', 'quirks']}>
                <Select mode="tags" placeholder="输入后回车添加，如：喜欢用数字编号" />
              </Form.Item>
            </>
          ),
        },
        {
          key: 'boundaries',
          label: '专长边界',
          children: (
            <>
              <Form.Item label="专长详细描述" name={['profile', 'cognitiveBoundaries', 'expertiseDescription']}>
                <TextArea rows={3} placeholder="详细描述擅长的具体方向..." />
              </Form.Item>
              <Form.Item label="知识边界说明" name={['profile', 'cognitiveBoundaries', 'knowledgeLimits']}>
                <Input placeholder="如：不擅长刑事诉讼，主要做民事" />
              </Form.Item>
              <Form.Item label="超出边界时的风格" name={['profile', 'cognitiveBoundaries', 'refusalStyle']}>
                <Input placeholder="如：坦诚说不擅长，推荐专业人士" />
              </Form.Item>
            </>
          ),
        },
        {
          key: 'memory',
          label: '记忆与推理',
          children: (
            <>
              <Form.Item
                label="核心记忆（永久，永不遗忘）"
                name={['profile', 'memory', 'coreMemory']}
                extra="手动设置，系统不会自动覆盖"
              >
                <TextArea rows={3} placeholder="如：用户叫小明，是程序员，有一只猫叫橘子" />
              </Form.Item>
              <Form.Item
                label="遗忘曲线（0=容易忘，100=记忆力强）"
                name={['profile', 'memory', 'forgettingCurve']}
              >
                <Slider min={0} max={100} marks={{ 0: '0', 30: '30', 70: '70', 100: '100' }} />
              </Form.Item>
              <Form.Item label="开启思维链（CoT）" name={['profile', 'reasoningConfig', 'enableCoT']} valuePropName="checked">
                <Switch defaultChecked />
              </Form.Item>
              <Form.Item label="开启自我反思" name={['profile', 'reasoningConfig', 'enableReflection']} valuePropName="checked">
                <Switch defaultChecked />
              </Form.Item>
              <Form.Item label="开启跨角色路由" name={['profile', 'reasoningConfig', 'enableRouting']} valuePropName="checked">
                <Switch defaultChecked />
              </Form.Item>
            </>
          ),
        },
      ]} />
    </>
  );
}
