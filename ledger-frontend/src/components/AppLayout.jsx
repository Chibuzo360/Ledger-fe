import React from 'react';
import { Layout, Menu, Button } from 'antd';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Header, Sider, Content } = Layout;

const AppLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      key: '1',
      label: <Link to="/dashboard">Dashboard</Link>,
    },
    {
      key: '2',
      label: <Link to="/transactions">Transactions</Link>,
    },
    {
      key: '3',
      label: <Link to="/expenses">Expenses</Link>,
    },
    {
      key: '4',
      label: <Link to="/retailers">Retailers</Link>,
    },
    {
      key: '5',
      label: <Link to="/product">Products</Link>,
    },
    {
      key: '6',
      label: <Link to="/stock-in">Stock In</Link>,
    }
  ];

  return (
    // CHANGED: minHeight -> height. minHeight lets this Layout (and
    // everything in it, including the browser body) grow taller than the
    // viewport whenever a page's content is long -- which is exactly what
    // was making the WHOLE PAGE scroll instead of just the table inside
    // it. Fixing height to 100vh means this outer shell can never grow
    // past the viewport; only the Content region below (which gets its
    // own overflow: auto) is allowed to scroll internally.
    <Layout style={{ height: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', color: '#fff', textAlign: 'center', lineHeight: '32px' }}>
          CAV LEDGER
        </div>
        <Menu theme="dark" mode="inline" defaultSelectedKeys={['1']} items={menuItems} />
      </Sider>

      {/* CHANGED: same height fix applied to this inner Layout too --
          antd's vertical Layout is a flex column, so without an explicit
          height here this inner shell would still be free to grow with
          its content and drag the outer one with it. */}
      <Layout style={{ height: '100vh' }}>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: '0 0 auto' }}>
          <div>
            <span>Welcome, <strong>{user?.name || 'User'}</strong> </span>
            <span style={{ fontSize: '12px', color: '#8c8c8c' }}>({user?.role})</span>
          </div>
          <Button type="primary" danger onClick={handleLogout}>
            Logout
          </Button>
        </Header>

        {/* CHANGED: flex:1 lets this Content region claim exactly the
            leftover vertical space below the fixed-height Header, and
            overflow:auto gives IT the scrollbar -- not the page. Every
            page's table (or anything else long) now scrolls inside this
            box, while the Sider and Header stay pinned on screen. */}
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', flex: '1 1 auto', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;