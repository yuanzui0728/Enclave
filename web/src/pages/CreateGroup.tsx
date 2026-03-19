import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCharacterStore } from '../store/characterStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../services/api';
import { Avatar } from '../components/character/Avatar';
import { Colors } from '../theme/colors';
import type { Character } from '../types/character';

export function CreateGroup() {
  const navigate = useNavigate();
  const { characters, fetchCharacters } = useCharacterStore();
  const { userId, username } = useAuthStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState('');
  const [step, setStep] = useState<'select' | 'name'>('select');
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchCharacters(); }, []);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNext = () => {
    if (selected.size === 0) return;
    const names = characters.filter((c) => selected.has(c.id)).map((c) => c.name);
    setGroupName(`${username}、${names.slice(0, 2).join('、')}${names.length > 2 ? '…' : ''}`);
    setStep('name');
  };

  const handleCreate = async () => {
    if (!groupName.trim() || !userId) return;
    setCreating(true);
    try {
      const group = await api.createGroup(groupName.trim(), userId, Array.from(selected));
      navigate(`/group/${group.id}`, { replace: true });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: Colors.bgMain, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: Colors.navBg, padding: '8px',
        borderBottom: `0.5px solid ${Colors.navBorder}`, flexShrink: 0,
      }}>
        <button onClick={() => navigate(-1)} style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', width: 40 }}>
          <span style={{ fontSize: 28, color: Colors.textPrimary, lineHeight: '30px' }}>‹</span>
        </button>
        <span style={{ fontSize: 15, fontWeight: 600, color: Colors.textPrimary }}>
          {step === 'select' ? '选择群成员' : '群聊名称'}
        </span>
        {step === 'select' ? (
          <button
            onClick={handleNext}
            disabled={selected.size === 0}
            style={{ padding: '4px 12px', background: 'none', border: 'none', cursor: selected.size > 0 ? 'pointer' : 'default' }}
          >
            <span style={{ fontSize: 15, color: selected.size > 0 ? Colors.primary : Colors.textLight }}>
              下一步({selected.size})
            </span>
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={!groupName.trim() || creating}
            style={{ padding: '4px 12px', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 15, color: groupName.trim() && !creating ? Colors.primary : Colors.textLight }}>
              {creating ? '创建中…' : '完成'}
            </span>
          </button>
        )}
      </div>

      {step === 'select' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {characters.map((char: Character, i) => (
            <React.Fragment key={char.id}>
              <div
                onClick={() => toggle(char.id)}
                style={{
                  display: 'flex', alignItems: 'center',
                  backgroundColor: Colors.bgWhite, padding: '12px 16px', cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11,
                  border: `2px solid ${selected.has(char.id) ? Colors.primary : Colors.border}`,
                  backgroundColor: selected.has(char.id) ? Colors.primary : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 12, flexShrink: 0,
                }}>
                  {selected.has(char.id) && <span style={{ color: '#fff', fontSize: 13 }}>✓</span>}
                </div>
                <Avatar emoji={char.avatar} size={44} />
                <div style={{ marginLeft: 12 }}>
                  <div style={{ fontSize: 15, color: Colors.textPrimary }}>{char.name}</div>
                  <div style={{ fontSize: 12, color: Colors.textSecondary }}>{char.relationship}</div>
                </div>
              </div>
              {i < characters.length - 1 && (
                <div style={{ height: 0.5, backgroundColor: Colors.border, marginLeft: 90 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, padding: 16 }}>
          <div style={{ backgroundColor: Colors.bgWhite, borderRadius: 10, padding: '0 16px' }}>
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={30}
              style={{
                width: '100%', padding: '14px 0', fontSize: 16,
                color: Colors.textPrimary, border: 'none', outline: 'none',
                backgroundColor: 'transparent', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: Colors.textLight, textAlign: 'right' }}>
            {groupName.length}/30
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: Colors.textSecondary, marginBottom: 12 }}>已选成员</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {characters.filter((c) => selected.has(c.id)).map((c) => (
                <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <Avatar emoji={c.avatar} size={44} />
                  <span style={{ fontSize: 11, color: Colors.textSecondary }}>{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
