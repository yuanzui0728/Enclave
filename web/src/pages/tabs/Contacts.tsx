import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../../store/characterStore';
import { Avatar } from '../../components/character/Avatar';
import { ExpertBadge } from '../../components/character/ExpertBadge';
import { Colors } from '../../theme/colors';
import type { Character } from '../../types/character';

export function Contacts() {
  const navigate = useNavigate();
  const { characters, loading, fetchCharacters } = useCharacterStore();

  useEffect(() => {
    fetchCharacters();
  }, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,251,245,0.88)',
        padding: '12px 16px',
        borderBottom: '0.5px solid rgba(249,115,22,0.15)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: Colors.textPrimary }}>通讯录</span>
        <button
          onClick={() => navigate('/character/new')}
          style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 22, color: Colors.primary }}>＋</span>
        </button>
      </div>

      {/* New friends entry */}
      <div
        onClick={() => navigate('/friend-requests')}
        style={{
          display: 'flex', alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.7)',
          padding: '12px 16px',
          borderBottom: `0.5px solid ${Colors.border}`, cursor: 'pointer',
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 24,
          background: 'linear-gradient(135deg, #F97316 0%, #FB923C 100%)',
          boxShadow: '0 2px 10px rgba(249,115,22,0.35)',
          display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 22, marginRight: 12, flexShrink: 0,
        }}>
          👋
        </div>
        <span style={{ fontSize: 15, color: Colors.textPrimary, fontWeight: 500 }}>新的朋友</span>
        <span style={{ marginLeft: 'auto', fontSize: 18, color: Colors.textLight }}>›</span>
      </div>

      {/* Create group entry */}
      <div
        onClick={() => navigate('/group/new')}
        style={{
          display: 'flex', alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.7)',
          padding: '12px 16px',
          borderBottom: `0.5px solid ${Colors.border}`, cursor: 'pointer',
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 24,
          background: 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
          boxShadow: '0 2px 10px rgba(52,211,153,0.3)',
          display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: 22, marginRight: 12, flexShrink: 0,
        }}>
          👥
        </div>
        <span style={{ fontSize: 15, color: Colors.textPrimary, fontWeight: 500 }}>发起群聊</span>
        <span style={{ marginLeft: 'auto', fontSize: 18, color: Colors.textLight }}>›</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: Colors.textSecondary, fontSize: 13 }}>
            加载中…
          </div>
        )}
        {!loading && characters.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>👥</span>
            <span style={{ fontSize: 15, color: Colors.textSecondary }}>还没有角色</span>
            <button
              onClick={() => navigate('/character/new')}
              style={{
                marginTop: 16, padding: '10px 24px',
                background: 'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
                boxShadow: '0 2px 12px rgba(249,115,22,0.35)',
                borderRadius: 10,
                color: '#fff', fontSize: 15, cursor: 'pointer',
                border: 'none',
              }}
            >
              创建角色
            </button>
          </div>
        )}
        {characters.map((char: Character, i) => (
          <React.Fragment key={char.id}>
            <div
              onClick={() => navigate(`/character/${char.id}`)}
              style={{
                display: 'flex', alignItems: 'center',
                backgroundColor: 'transparent', padding: '12px 16px', cursor: 'pointer',
              }}
            >
              <Avatar emoji={char.avatar} size={48} showOnline isOnline={char.isOnline} />
              <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, color: Colors.textPrimary, fontWeight: 500 }}>
                    {char.name}
                  </span>
                  <span style={{ fontSize: 12, color: Colors.textSecondary }}>
                    {char.relationship}
                  </span>
                </div>
                {char.currentStatus ? (
                  <div style={{ fontSize: 12, color: Colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {char.currentStatus}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {char.expertDomains?.slice(0, 3).map((d) => (
                      <ExpertBadge key={d} domain={d} />
                    ))}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 18, color: Colors.textLight }}>›</span>
            </div>
            {i < characters.length - 1 && (
              <div style={{ height: 0.5, backgroundColor: Colors.border, marginLeft: 76 }} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
