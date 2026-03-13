import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ExpertDomain, RelationshipType } from '../types/character';
import { api } from '../services/api';
import { Colors } from '../theme/colors';

const AVATARS = ['👨', '👩', '🧑', '👴', '👵', '🧔', '👨‍💼', '👩‍💼', '👨‍⚕️', '👩‍⚕️', '👨‍⚖️', '👩‍⚖️'];

const RELATIONSHIP_OPTIONS: { type: RelationshipType; label: string; desc: string }[] = [
  { type: 'family', label: '家人', desc: '父母、兄弟姐妹、伴侣' },
  { type: 'friend', label: '朋友', desc: '同学、室友、老朋友' },
  { type: 'expert', label: '专家', desc: '律师、医生、顾问' },
  { type: 'custom', label: '自定义', desc: '任意关系' },
];

const DOMAIN_OPTIONS: { domain: ExpertDomain; label: string; emoji: string }[] = [
  { domain: 'law', label: '法律', emoji: '⚖️' },
  { domain: 'medicine', label: '医疗', emoji: '🩺' },
  { domain: 'finance', label: '理财', emoji: '📊' },
  { domain: 'tech', label: '技术', emoji: '💻' },
  { domain: 'psychology', label: '心理', emoji: '🌿' },
  { domain: 'education', label: '教育', emoji: '📚' },
  { domain: 'management', label: '管理', emoji: '📋' },
  { domain: 'general', label: '综合', emoji: '✨' },
];

export function CreateCharacter() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('👤');
  const [selectedType, setSelectedType] = useState<RelationshipType>('friend');
  const [selectedDomains, setSelectedDomains] = useState<ExpertDomain[]>([]);
  const [personality, setPersonality] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleDomain = (domain: ExpertDomain) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const canCreate = name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate) return;
    setLoading(true);
    setError('');
    try {
      await api.createCharacter({
        name: name.trim(),
        avatar: selectedAvatar,
        relationship: relationship.trim() || name.trim(),
        relationshipType: selectedType,
        expertDomains: selectedDomains,
        personality: personality.trim(),
        bio: personality.trim(),
        isOnline: true,
        isTemplate: false,
      });
      navigate(-1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: Colors.bgMain, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.navBg, padding: '8px 12px',
        borderBottom: `0.5px solid ${Colors.navBorder}`, flexShrink: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', width: 40 }}>
          <span style={{ fontSize: 18, color: Colors.textPrimary }}>✕</span>
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>创建角色</span>
        <button
          onClick={handleCreate}
          disabled={!canCreate || loading}
          style={{
            padding: 8, background: 'none', border: 'none',
            cursor: canCreate ? 'pointer' : 'default',
          }}
        >
          <span style={{ fontSize: 15, color: canCreate ? Colors.primary : Colors.textLight, fontWeight: 600 }}>
            {loading ? '创建中…' : '完成'}
          </span>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px' }}>
        {error && (
          <div style={{ fontSize: 13, color: '#F85149', marginBottom: 12, textAlign: 'center' }}>{error}</div>
        )}

        {/* Avatar picker */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>选择头像</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {AVATARS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => setSelectedAvatar(emoji)}
                style={{
                  width: 52, height: 52, borderRadius: 10,
                  backgroundColor: Colors.bgWhite, fontSize: 28,
                  border: `2px solid ${selectedAvatar === emoji ? Colors.primary : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>姓名 *</div>
          <input
            style={{
              width: '100%', backgroundColor: Colors.bgWhite, borderRadius: 10,
              padding: '12px', fontSize: 15, color: Colors.textPrimary,
            }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="给这个角色起个名字"
            maxLength={20}
          />
        </div>

        {/* Relationship label */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>关系标签</div>
          <input
            style={{
              width: '100%', backgroundColor: Colors.bgWhite, borderRadius: 10,
              padding: '12px', fontSize: 15, color: Colors.textPrimary,
            }}
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="例如：律师朋友、大学室友、心理顾问"
            maxLength={20}
          />
        </div>

        {/* Relationship type */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>关系类型</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {RELATIONSHIP_OPTIONS.map((opt) => (
              <button
                key={opt.type}
                onClick={() => setSelectedType(opt.type)}
                style={{
                  flex: '1 1 45%', backgroundColor: Colors.bgWhite, borderRadius: 10,
                  padding: '12px', textAlign: 'left', cursor: 'pointer',
                  border: `2px solid ${selectedType === opt.type ? Colors.primary : 'transparent'}`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 600, color: selectedType === opt.type ? Colors.primary : Colors.textPrimary, marginBottom: 2 }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: Colors.textSecondary }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Expert domains */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>专长领域（可多选）</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {DOMAIN_OPTIONS.map((opt) => {
              const selected = selectedDomains.includes(opt.domain);
              return (
                <button
                  key={opt.domain}
                  onClick={() => toggleDomain(opt.domain)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    backgroundColor: Colors.bgWhite, borderRadius: 20,
                    padding: '8px 14px', cursor: 'pointer',
                    border: `1.5px solid ${selected ? Colors.primary : Colors.border}`,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{opt.emoji}</span>
                  <span style={{ fontSize: 13, color: selected ? Colors.primary : Colors.textSecondary, fontWeight: selected ? 500 : 400 }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Personality */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>性格描述</div>
          <textarea
            style={{
              width: '100%', backgroundColor: Colors.bgWhite, borderRadius: 10,
              padding: '12px', fontSize: 15, color: Colors.textPrimary,
              minHeight: 80, resize: 'none',
            }}
            value={personality}
            onChange={(e) => setPersonality(e.target.value)}
            placeholder="描述这个角色的性格特点"
            maxLength={200}
          />
        </div>

        {/* Import option */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>或者</div>
          <button
            onClick={() => navigate('/import')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              backgroundColor: Colors.bgWhite, borderRadius: 12,
              padding: '16px', gap: 12, cursor: 'pointer', border: 'none', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 28 }}>📥</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: Colors.textPrimary }}>导入聊天记录</div>
              <div style={{ fontSize: 11, color: Colors.textSecondary, marginTop: 2 }}>让 AI 自动学习真实的说话风格</div>
            </div>
            <span style={{ fontSize: 20, color: Colors.textLight }}>›</span>
          </button>
        </div>
      </div>
    </div>
  );
}
