import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Colors } from '../theme/colors';

export function Splash() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const onboardingCompleted = useAuthStore((s) => s.onboardingCompleted);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 触发入场动画
    const show = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      if (token && onboardingCompleted) {
        navigate('/tabs/chat', { replace: true });
      } else {
        navigate('/onboarding', { replace: true });
      }
    }, 1800);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(timer);
    };
  }, [token, onboardingCompleted, navigate]);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: Colors.bgMain, height: '100%',
    }}>
      <div style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.9s ease, transform 0.9s ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          fontSize: 72, fontWeight: 700, color: Colors.primaryLight,
          letterSpacing: 12, marginBottom: 12,
        }}>
          隐界
        </div>
        <div style={{
          fontSize: 13, color: 'rgba(249,115,22,0.6)', letterSpacing: 3,
          opacity: visible ? 1 : 0,
          transition: 'opacity 1.2s ease 0.4s',
        }}>
          推开隐界，他们都在
        </div>
      </div>
    </div>
  );
}
