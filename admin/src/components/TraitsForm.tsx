import { Form, Input, Select, Radio } from 'antd';

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

      <Form.Item label="长期记忆摘要" name={['profile', 'memorySummary']}>
        <TextArea rows={3} placeholder="角色与用户的长期记忆摘要（可手动编辑）" />
      </Form.Item>
    </>
  );
}
