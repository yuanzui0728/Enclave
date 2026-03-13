import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import { TeamOutlined, RobotOutlined } from '@ant-design/icons';
import CharacterList from './pages/CharacterList';
import CharacterEdit from './pages/CharacterEdit';
import ModelConfig from './pages/ModelConfig';

const { Header, Content } = Layout;

function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = location.pathname.startsWith('/model-config') ? 'model-config' : 'characters';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px' }}>
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginRight: 32 }}>隐界管理后台</span>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          style={{ flex: 1, minWidth: 0 }}
          items={[
            { key: 'characters', icon: <TeamOutlined />, label: '角色管理', onClick: () => navigate('/characters') },
            { key: 'model-config', icon: <RobotOutlined />, label: '模型配置', onClick: () => navigate('/model-config') },
          ]}
        />
      </Header>
      <Content>
        <Routes>
          <Route path="/" element={<Navigate to="/characters" replace />} />
          <Route path="/characters" element={<CharacterList />} />
          <Route path="/characters/:id" element={<CharacterEdit />} />
          <Route path="/model-config" element={<ModelConfig />} />
        </Routes>
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
