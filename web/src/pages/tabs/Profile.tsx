import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../services/api';
import { Colors } from '../../theme/colors';

const AVATARS = ['🙂', '😎', '🤓', '🧑‍💻', '👩‍🎨', '🧑‍🚀', '🦊', '🐼', '🐸', '🌙', '⭐', '🔮'];

export function Profile() {
  const navigate = useNavigate();
  const { username, userId, logout } = useAuthStore();
  const [editing, setEditing] = useState(false);
  const [avatar, setAvatar] = useState('🙂');
  const [signature, setSignature] = useState('');
  const [newUsername, setNewUsername] = useState(username ?? '');
  const [saving, setSaving] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await api.updateUser(userId, { username: newUsername.trim() || undefined, avatar, signature: signature.trim() || undefined });
      setEditing(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: 'rgba(255,251,245,0.88)',
        padding: '12px 16px',
        borderBottom: '0.5px solid rgba(249,115,22,0.15)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: Colors.textPrimary }}>我</span>
        <button
          onClick={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
          style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 14, color: Colors.primary }}>
            {editing ? (saving ? '保存中…' : '完成') : '编辑'}
          </span>
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* User info */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(249,115,22,0.06) 0%, rgba(251,191,36,0.04) 100%)',
          border: '0.5px solid rgba(249,115,22,0.12)',
          borderRadius: 16,
          margin: '12px 12px 8px',
          padding: '20px 16px',
        }}>
          <div
            onClick={() => editing && setShowAvatarPicker(true)}
            style={{
              width: 64, height: 64, borderRadius: 10,
              backgroundColor: Colors.bgCard,
              border: '2px solid rgba(249,115,22,0.30)',
              boxShadow: '0 0 16px rgba(249,115,22,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, marginRight: 16, cursor: editing ? 'pointer' : 'default',
              position: 'relative',
            }}
          >
            {avatar}
            {editing && (
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 18, height: 18, borderRadius: 9,
                backgroundColor: Colors.primary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: '#fff',
              }}>✎</div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            {editing ? (
              <input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                maxLength={20}
                style={{
                  fontSize: 18, fontWeight: 600, color: Colors.textPrimary,
                  border: 'none', borderBottom: `1px solid ${Colors.border}`,
                  outline: 'none', backgroundColor: 'transparent',
                  width: '100%', marginBottom: 8,
                }}
              />
            ) : (
              <div style={{ fontSize: 18, fontWeight: 600, color: Colors.textPrimary, marginBottom: 4 }}>
                {username ?? '用户'}
              </div>
            )}
            {editing ? (
              <input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                maxLength={50}
                placeholder="设置签名…"
                style={{
                  fontSize: 13, color: Colors.textSecondary,
                  border: 'none', borderBottom: `1px solid ${Colors.border}`,
                  outline: 'none', backgroundColor: 'transparent', width: '100%',
                }}
              />
            ) : (
              <div style={{ fontSize: 13, color: Colors.textSecondary }}>
                {signature || '隐界用户'}
              </div>
            )}
          </div>
        </div>

        {/* Moments entry */}
        <div
          onClick={() => navigate('/tabs/moments')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: 'rgba(255,255,255,0.7)',
            borderRadius: 12,
            margin: '0 12px 8px',
            padding: '14px 16px', cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 15, color: Colors.textPrimary }}>我的朋友圈</span>
          <span style={{ fontSize: 18, color: Colors.textLight }}>›</span>
        </div>

        {/* Logout */}
        <div style={{ padding: '24px 16px' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.20)',
              borderRadius: 12, fontSize: 15,
              color: '#EF4444', cursor: 'pointer',
            }}
          >
            退出登录
          </button>
        </div>
      </div>

      {/* Avatar picker modal */}
      {showAvatarPicker && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}
          onClick={() => setShowAvatarPicker(false)}
        >
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
            <div style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary, marginBottom: 16, textAlign: 'center' }}>选择头像</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
              {AVATARS.map((a) => (
                <button
                  key={a}
                  onClick={() => { setAvatar(a); setShowAvatarPicker(false); }}
                  style={{
                    width: 52, height: 52, borderRadius: 10, fontSize: 28,
                    border: `2px solid ${avatar === a ? Colors.primary : 'transparent'}`,
                    backgroundColor: Colors.bgCard, cursor: 'pointer',
                  }}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
