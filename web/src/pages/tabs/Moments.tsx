import React, { useEffect, useState } from 'react';
import { useMomentsStore } from '../../store/momentsStore';
import { useAuthStore } from '../../store/authStore';
import { MomentCard } from '../../components/moments/MomentCard';
import { Colors } from '../../theme/colors';

export function Moments() {
  const { moments, loading, fetchMoments, postMoment } = useMomentsStore();
  const { userId, username } = useAuthStore();
  const sorted = [...moments].sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());

  const [showCompose, setShowCompose] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => { fetchMoments(); }, []);


  const handlePost = async () => {
    if (!text.trim() || !userId || !username) return;
    setPosting(true);
    try {
      await postMoment(userId, username, '🙂', text.trim());
      setText('');
      setShowCompose(false);
      await fetchMoments();
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ backgroundColor: 'transparent', flexShrink: 0 }}>
        <div style={{
          height: 160,
          background: 'linear-gradient(180deg, #FFF3E0 0%, #FFF8EE 60%, #FFFBF5 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(249,115,22,0.18) 0%, transparent 70%)',
          }} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic', position: 'relative' }}>
            隐界的朋友圈，比你的还热闹
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute', right: 16, top: -32,
            width: 64, height: 64, borderRadius: 8,
            backgroundColor: Colors.bgCard,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `3px solid ${Colors.primary}`, fontSize: 36,
          }}>
            🙂
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 16px 12px' }}>
            <span style={{ fontSize: 17, fontWeight: 600, color: Colors.textPrimary }}>朋友圈</span>
            <button
              onClick={() => setShowCompose(true)}
              style={{ padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 22 }}>📷</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feed */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: Colors.textSecondary, fontSize: 13 }}>加载中…</div>
        ) : sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>🌐</span>
            <span style={{ fontSize: 15, color: Colors.textSecondary }}>朋友圈还没有动态</span>
            <span style={{ fontSize: 13, color: Colors.textLight, marginTop: 6 }}>点右上角📷发布，或等待朋友们发布</span>
          </div>
        ) : (
          sorted.map((m) => <MomentCard key={m.id} moment={m} />)
        )}
      </div>

      {/* Compose modal */}
      {showCompose && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', zIndex: 100,
        }} onClick={() => setShowCompose(false)}>
          <div
            style={{
              width: '100%',
              backgroundColor: 'rgba(255,251,245,0.98)',
              border: '0.5px solid rgba(249,115,22,0.15)',
              borderRadius: '20px 20px 0 0',
              padding: 20,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => setShowCompose(false)} style={{ background: 'none', border: 'none', fontSize: 15, color: Colors.textSecondary, cursor: 'pointer' }}>取消</button>
              <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>发朋友圈</span>
              <button
                onClick={handlePost}
                disabled={!text.trim() || posting}
                style={{
                  background: 'none', border: 'none', fontSize: 15, fontWeight: 600,
                  color: text.trim() && !posting ? Colors.primary : Colors.textLight,
                  cursor: text.trim() && !posting ? 'pointer' : 'default',
                }}
              >
                {posting ? '发布中…' : '发布'}
              </button>
            </div>
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="这一刻的想法…"
              maxLength={500}
              style={{
                width: '100%', minHeight: 120, border: 'none', outline: 'none',
                fontSize: 16, color: Colors.textPrimary, resize: 'none',
                backgroundColor: 'transparent', lineHeight: '24px',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ textAlign: 'right', fontSize: 12, color: Colors.textLight, marginTop: 8 }}>
              {text.length}/500
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
