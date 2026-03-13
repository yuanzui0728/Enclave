import { useState, useEffect } from 'react';
import { Select, Button, message, Card, Typography, Spin } from 'antd';
import { adminApi } from '../services/api';

const { Title, Text } = Typography;

const MODEL_GROUPS = {
  Claude: [
    'claude-3-5-sonnet-20241022',
    'claude-haiku-4-5-20251001-thinking',
    'claude-opus-4-20250514',
    'claude-sonnet-4-20250514-thinking',
    'claude-sonnet-4-5',
  ],
  DeepSeek: [
    'deepseek-chat',
    'deepseek-r1',
    'deepseek-r1-0528',
    'deepseek-v3',
    'deepseek-v3-1-think-250821',
    'deepseek-v3.1-fast',
    'deepseek-v3.2-exp-thinking',
  ],
  GPT: [
    'gpt-4-0613',
    'gpt-4-vision-preview',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-mini-2025-04-14',
    'gpt-4.1-nano',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-5',
    'gpt-5-all',
    'gpt-5.1-chat-latest',
    'gpt-5.3-chat-latest',
  ],
  Gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  Other: [
    'ERNIE-Tiny-8K',
    'grok-4.1',
    'grok-4.1-fast',
    'llama-3.2-1b-instruct',
    'o1',
    'o3',
    'o4-mini-all',
    'qvq-max',
    'qwen-turbo-2025-07-15',
    'qwen3-coder-plus',
    'qwen3-max',
  ],
};

export default function ModelConfig() {
  const [currentModel, setCurrentModel] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCurrentModel();
  }, []);

  const loadCurrentModel = async () => {
    try {
      const { model } = await adminApi.getAiModel();
      setCurrentModel(model);
      setSelectedModel(model);
    } catch (error) {
      message.error('加载当前模型失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedModel) {
      message.warning('请选择一个模型');
      return;
    }

    setSaving(true);
    try {
      await adminApi.setAiModel(selectedModel);
      setCurrentModel(selectedModel);
      message.success('模型切换成功');
    } catch (error) {
      message.error('模型切换失败');
    } finally {
      setSaving(false);
    }
  };

  const options = Object.entries(MODEL_GROUPS).flatMap(([group, models]) =>
    models.map((model) => ({
      label: model,
      value: model,
      group,
    }))
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <Card>
        <Title level={2}>AI 模型配置</Title>
        <div style={{ marginBottom: '16px' }}>
          <Text type="secondary">当前使用模型：</Text>
          <Text strong style={{ marginLeft: '8px' }}>
            {currentModel}
          </Text>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <Text>选择模型：</Text>
          <Select
            showSearch
            style={{ width: '100%', marginTop: '8px' }}
            placeholder="搜索或选择模型"
            value={selectedModel}
            onChange={setSelectedModel}
            options={options.map((opt) => ({
              label: `[${opt.group}] ${opt.label}`,
              value: opt.value,
            }))}
            filterOption={(input, option) =>
              (option?.label?.toString() ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>

        <Button
          type="primary"
          onClick={handleSave}
          loading={saving}
          disabled={selectedModel === currentModel}
        >
          保存
        </Button>
      </Card>
    </div>
  );
}
