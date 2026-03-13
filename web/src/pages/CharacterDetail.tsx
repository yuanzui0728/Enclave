import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../store/characterStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { Avatar } from '../components/character/Avatar';
import { ExpertBadge } from '../components/character/ExpertBadge';
import { Colors } from '../theme/colors';

export function CharacterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getById = useCharacterStore((s) => s.getById);
  const userId = useAuthStore((s) => s.userId);
  const character = id ? getById(id) : undefined;
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async () => {
    if (!character || !userId) return;
    setLoading(true);
    try {
      const conv = await api.getOrCreateConversation(userId, character.id);
      navigate(`/chat/${conv.id}`);
    } finally {
      setLoading(false);
    }
  };

  if (!character) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgMain, height: '100%' }}>
      <span style={{ color: Colors.textSecondary }}>角色不存在</span>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: Colors.bgMain, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.navBg, padding: '8px',
        borderBottom: `0.5px solid ${Colors.navBorder}`, flexShrink: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', width: 40 }}>
          <span style={{ fontSize: 28, color: Colors.textPrimary, lineHeight: '30px' }}>‹</span>
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>详细资料</span>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Profile card */}
        <div style={{
          backgroundColor: Colors.bgWhite,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '20px 16px', marginBottom: 8,
        }}>
          <div style={{ marginBottom: 12 }}>
            <Avatar emoji={character.avatar} size={80} showOnline isOnline={character.isOnline} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 600, color: Colors.textPrimary, marginBottom: 4 }}>
            {character.name}
          </div>
          <div style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 12 }}>
            {character.relationship}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center' }}>
            {character.expertDomains?.map((d) => <ExpertBadge key={d} domain={d} />)}
          </div>
        </div>

        {/* Bio */}
        <div style={{ backgroundColor: Colors.bgWhite, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>简介</div>
          <div style={{ fontSize: 15, color: Colors.textPrimary, lineHeight: '22px' }}>{character.bio}</div>
        </div>

        {/* Personality */}
        <div style={{ backgroundColor: Colors.bgWhite, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>性格特点</div>
          <div style={{ fontSize: 15, color: Colors.textPrimary, lineHeight: '22px' }}>{character.personality}</div>
        </div>

        {/* Actions */}
        <div style={{ padding: '20px 16px' }}>
          <button
            onClick={handleSendMessage}
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: Colors.primary, borderRadius: 8,
              fontSize: 15, fontWeight: 600, color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '...' : '发消息'}
          </button>
        </div>
      </div>
    </div>
  );
}
