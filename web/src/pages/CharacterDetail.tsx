import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../store/characterStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { Avatar } from '../components/character/Avatar';
import { ExpertBadge } from '../components/character/ExpertBadge';
import { MomentCard } from '../components/moments/MomentCard';
import { Colors } from '../theme/colors';
import type { Moment } from '../types/moment';

type Tab = 'profile' | 'moments' | 'feed';

function normalizeMoment(raw: Record<string, unknown>): Moment {
  return {
    ...raw,
    postedAt: new Date(raw.postedAt as string),
    interactions: ((raw.interactions ?? []) as Record<string, unknown>[]).map((i) => ({
      ...i,
      createdAt: new Date(i.createdAt as string),
    })),
  } as Moment;
}

export function CharacterDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const getById = useCharacterStore((s) => s.getById);
  const userId = useAuthStore((s) => s.userId);
  const character = id ? getById(id) : undefined;
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('profile');
  const [moments, setMoments] = useState<Moment[]>([]);
  const [feedPosts, setFeedPosts] = useState<{ id: string; text: string; postedAt: string; likeCount: number; commentCount: number }[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (tab === 'moments') {
      setTabLoading(true);
      api.getMoments(id)
        .then((data) => setMoments((data as Record<string, unknown>[]).map(normalizeMoment)))
        .finally(() => setTabLoading(false));
    } else if (tab === 'feed') {
      setTabLoading(true);
      api.getFeed(1)
        .then((res) => {
          const posts = (res.posts as Record<string, unknown>[]).filter((p) => p.authorId === id);
          setFeedPosts(posts as typeof feedPosts);
        })
        .finally(() => setTabLoading(false));
    }
  }, [tab, id]);

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
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <span style={{ color: Colors.textSecondary }}>角色不存在</span>
    </div>
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: '资料' },
    { key: 'moments', label: '朋友圈' },
    { key: 'feed', label: '视频号' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'transparent', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,251,245,0.88)',
        padding: '8px',
        borderBottom: '0.5px solid rgba(249,115,22,0.15)', flexShrink: 0,
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
          background: 'linear-gradient(135deg, rgba(249,115,22,0.06) 0%, rgba(251,191,36,0.04) 100%)',
          border: '0.5px solid rgba(249,115,22,0.15)',
          borderRadius: 16,
          margin: '12px 12px 8px',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '20px 16px 16px',
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
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
            {character.expertDomains?.map((d) => <ExpertBadge key={d} domain={d} />)}
          </div>
          <button
            onClick={handleSendMessage}
            disabled={loading}
            style={{
              width: '100%', padding: '12px',
              background: 'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
              boxShadow: '0 4px 16px rgba(249,115,22,0.35)',
              borderRadius: 12,
              fontSize: 15, fontWeight: 600, color: '#fff',
              cursor: loading ? 'not-allowed' : 'pointer', border: 'none',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '...' : '发消息'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          backgroundColor: 'rgba(255,255,255,0.7)',
          borderRadius: '12px 12px 0 0',
          margin: '0 12px',
          borderBottom: `0.5px solid ${Colors.border}`, marginBottom: 8, flexShrink: 0,
        }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
                color: tab === t.key ? Colors.primary : Colors.textSecondary,
                borderBottom: tab === t.key ? '2px solid #F97316' : '2px solid transparent',
                textShadow: tab === t.key ? '0 0 8px rgba(249,115,22,0.4)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'profile' && (
          <>
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderRadius: 12,
              margin: '0 12px 8px',
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>简介</div>
              <div style={{ fontSize: 15, color: Colors.textPrimary, lineHeight: '22px' }}>{character.bio}</div>
            </div>
            <div style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              borderRadius: 12,
              margin: '0 12px 8px',
              padding: '12px 16px',
            }}>
              <div style={{ fontSize: 13, color: Colors.textSecondary, fontWeight: 500, marginBottom: 8 }}>性格特点</div>
              <div style={{ fontSize: 15, color: Colors.textPrimary, lineHeight: '22px' }}>{character.personality}</div>
            </div>
          </>
        )}

        {tab === 'moments' && (
          tabLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: Colors.textSecondary, fontSize: 13 }}>加载中…</div>
          ) : moments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: Colors.textSecondary, fontSize: 14 }}>
              {character.name} 还没有发过朋友圈
            </div>
          ) : (
            moments.map((m) => <MomentCard key={m.id} moment={m} />)
          )
        )}

        {tab === 'feed' && (
          tabLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: Colors.textSecondary, fontSize: 13 }}>加载中…</div>
          ) : feedPosts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: Colors.textSecondary, fontSize: 14 }}>
              {character.name} 还没有发过视频号内容
            </div>
          ) : (
            feedPosts.map((p) => (
              <div key={p.id} style={{
                backgroundColor: 'rgba(255,255,255,0.7)',
                borderRadius: 12,
                margin: '0 12px 8px',
                padding: '12px 16px',
              }}>
                <div style={{ fontSize: 15, color: Colors.textPrimary, lineHeight: '22px', marginBottom: 8 }}>{p.text}</div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ fontSize: 12, color: Colors.textLight }}>❤️ {p.likeCount}</span>
                  <span style={{ fontSize: 12, color: Colors.textLight }}>💬 {p.commentCount}</span>
                  <span style={{ fontSize: 12, color: Colors.textLight }}>
                    {new Date(p.postedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                  </span>
                </div>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
