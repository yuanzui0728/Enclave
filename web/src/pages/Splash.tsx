import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../theme/colors';

export function Splash() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate(token ? '/tabs/chat' : '/login', { replace: true });
    }, 1200);
    return () => clearTimeout(timer);
  }, [token, navigate]);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.bgMain, height: '100%',
    }}>
      <div style={{
        fontSize: 72, fontWeight: 700, color: Colors.primaryLight,
        letterSpacing: 12, marginBottom: 12,
      }}>
        隐界
      </div>
      <div style={{ fontSize: 13, color: 'rgba(167,139,250,0.6)', letterSpacing: 3 }}>
        推开隐界，他们都在
      </div>
    </div>
  );
}
