import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Popconfirm, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Character } from '../types/character';
import { adminApi } from '../services/api';

const DOMAIN_LABELS: Record<string, string> = {
  law: '法律', medicine: '医疗', finance: '金融', tech: '技术',
  psychology: '心理', education: '教育', management: '管理', general: '通用',
};

const TYPE_COLORS: Record<string, string> = {
  family: 'red', friend: 'blue', expert: 'green', custom: 'purple',
};

const TYPE_LABELS: Record<string, string> = {
  family: '家人', friend: '朋友', expert: '专家', custom: '自定义',
};

export default function CharacterList() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setCharacters(await adminApi.list());
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    try {
      await adminApi.delete(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    {
      title: '头像',
      dataIndex: 'avatar',
      width: 60,
      render: (v: string) => <span style={{ fontSize: 24 }}>{v}</span>,
    },
    { title: '名称', dataIndex: 'name', width: 100 },
    { title: '关系标签', dataIndex: 'relationship', width: 120 },
    {
      title: '类型',
      dataIndex: 'relationshipType',
      width: 90,
      render: (v: string) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] ?? v}</Tag>,
    },
    {
      title: '专业领域',
      dataIndex: 'expertDomains',
      render: (domains: string[]) => (
        <Space wrap>
          {domains.map((d) => <Tag key={d}>{DOMAIN_LABELS[d] ?? d}</Tag>)}
        </Space>
      ),
    },
    {
      title: '在线',
      dataIndex: 'isOnline',
      width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '在线' : '离线'}</Tag>,
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: Character) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/characters/${record.id}`)}
          />
          <Popconfirm
            title="确认删除该角色？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>角色管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/characters/new')}>
          新建角色
        </Button>
      </div>
      <Table
        rowKey="id"
        dataSource={characters}
        columns={columns}
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </div>
  );
}
