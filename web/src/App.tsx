import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { TabBar } from './components/layout/TabBar';
import { useAuthStore } from './store/authStore';
import { Splash } from './pages/Splash';
import { Login } from './pages/Login';
import { ChatList } from './pages/tabs/ChatList';
import { Moments } from './pages/tabs/Moments';
import { Contacts } from './pages/tabs/Contacts';
import { Profile } from './pages/tabs/Profile';
import { ChatRoom } from './pages/ChatRoom';
import { CharacterDetail } from './pages/CharacterDetail';
import { CreateCharacter } from './pages/CreateCharacter';
import { Import } from './pages/Import';

function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function TabLayout() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Outlet />
      </div>
      <TabBar />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/login" element={<Login />} />

          <Route element={<RequireAuth />}>
            <Route element={<TabLayout />}>
              <Route path="/tabs/chat" element={<ChatList />} />
              <Route path="/tabs/moments" element={<Moments />} />
              <Route path="/tabs/contacts" element={<Contacts />} />
              <Route path="/tabs/profile" element={<Profile />} />
            </Route>
            <Route path="/chat/:id" element={<ChatRoom />} />
            <Route path="/character/new" element={<CreateCharacter />} />
            <Route path="/character/:id" element={<CharacterDetail />} />
            <Route path="/import" element={<Import />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
