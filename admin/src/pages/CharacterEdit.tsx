import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Form, Input, Select, Switch, Button, Tabs, message, Spin } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { Character } from '../types/character';
import { adminApi } from '../services/api';
import TraitsForm from '../components/TraitsForm';

const { TextArea } = Input;

const DOMAIN_OPTIONS = [
  { value: 'law', label: '法律' },
  { value: 'medicine', label: '医疗' },
  { value: 'finance', label: '金融' },
  { value: 'tech', label: '技术' },
  { value: 'psychology', label: '心理' },
  { value: 'education', label: '教育' },
  { value: 'management', label: '管理' },
  { value: 'general', label: '通用' },
];

const RELATIONSHIP_TYPE_OPTIONS = [
  { value: 'family', label: '家人' },
  { value: 'friend', label: '朋友' },
  { value: 'expert', label: '专家' },
  { value: 'custom', label: '自定义' },
];

export default function CharacterEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isNew = id === 'new';

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        isOnline: false,
        isTemplate: false,
        relationshipType: 'expert',
        expertDomains: [],
        profile: {
          traits: {
            speechPatterns: [],
            catchphrases: [],
            topicsOfInterest: [],
            responseLength: 'medium',
            emojiUsage: 'occasional',
          },
          memorySummary: '',
        },
      });
      return;
    }
    setLoading(true);
    adminApi.get(id!)
      .then((char) => {
        form.setFieldsValue({
          ...char,
          basePrompt: char.profile?.basePrompt,
        });
      })
      .catch(() => message.error('加载失败'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // Move basePrompt into profile
      const { basePrompt, ...rest } = values;
      const data: Partial<Character> = {
        ...rest,
        profile: {
          ...rest.profile,
          characterId: isNew ? `char_${Date.now()}` : id!,
          name: rest.name,
          relationship: rest.relationship,
          expertDomains: rest.expertDomains ?? [],
          basePrompt,
        },
      };

      if (isNew) {
        await adminApi.create(data);
        message.success('创建成功');
      } else {
        await adminApi.update(id!, data);
        message.success('保存成功');
      }
      navigate('/characters');
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) return; // validation error
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '80px auto' }} />;

  const tabItems = [
    {
      key: 'basic',
      label: '基本信息',
      children: (
        <>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：王建国" />
          </Form.Item>
          <Form.Item label="头像（Emoji）" name="avatar" rules={[{ required: true, message: '请输入头像' }]}>
            <Input placeholder="如：⚖️" style={{ fontSize: 20, width: 80 }} />
          </Form.Item>
          <Form.Item label="关系标签" name="relationship" rules={[{ required: true, message: '请输入关系标签' }]}>
            <Input placeholder="如：律师朋友" />
          </Form.Item>
          <Form.Item label="关系类型" name="relationshipType" rules={[{ required: true }]}>
            <Select options={RELATIONSHIP_TYPE_OPTIONS} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="专业领域" name="expertDomains">
            <Select mode="multiple" options={DOMAIN_OPTIONS} placeholder="选择领域" />
          </Form.Item>
          <Form.Item label="简介" name="bio">
            <TextArea rows={3} placeholder="角色简介..." />
          </Form.Item>
          <Form.Item label="在线状态" name="isOnline" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item label="是否模板" name="isTemplate" valuePropName="checked">
            <Switch />
          </Form.Item>
        </>
      ),
    },
    {
      key: 'traits',
      label: '提示词配置',
      children: <TraitsForm />,
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/characters')} />
        <h2 style={{ margin: 0 }}>{isNew ? '新建角色' : '编辑角色'}</h2>
      </div>
      <Form form={form} layout="vertical">
        <Tabs items={tabItems} />
        <Form.Item style={{ marginTop: 16 }}>
          <Button type="primary" onClick={handleSave} loading={saving}>
            保存
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
}
