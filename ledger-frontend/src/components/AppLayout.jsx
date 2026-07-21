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

  // Define the links for our sidebar menu
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
      label: <Link to="/retailers_account">Retailers</Link>,
    },
    // We will add more links (Products, Stock In, etc.) as we build them
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Sidebar Navigation */}
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', color: '#fff', textAlign: 'center', lineHeight: '32px' }}>
          CAV LEDGER
        </div>
        <Menu theme="dark" mode="inline" defaultSelectedKeys={['1']} items={menuItems} />
      </Sider>

      {/* Main App Container */}
      <Layout>
        {/* Top Header Bar */}
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span>Welcome, <strong>{user?.name || 'User'}</strong> </span>
            <span style={{ fontSize: '12px', color: '#8c8c8c' }}>({user?.role})</span>
          </div>
          <Button type="primary" danger onClick={handleLogout}>
            Logout
          </Button>
        </Header>

        {/* Dynamic Content Area */}
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
          <Outlet /> {/* This dynamically renders the active child route component */}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;