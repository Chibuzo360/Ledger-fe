import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Table, Tag, Typography, Button, Space } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

const DashboardPage = () => {
  const { user } = useAuth(); // Reads { role, identifier } from your context
  const isDirector = user?.role === 'ROLE_DIRECTOR';

  // State placeholders for dashboard stats
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingApprovals: 0,
    todaySalesCount: 0,
    outstandingCredits: 0
  });

  const [recentTransactions, setRecentTransactions] = useState([]);

  useEffect(() => {
    // TODO: Fetch real data from your api/axiosConfig setup later
    // Loading mock data for now based on role
    setStats({
      totalRevenue: isDirector ? 4500000 : 0, // e.g., in ₦ (Naira)
      pendingApprovals: isDirector ? 5 : 0,
      todaySalesCount: 12,
      outstandingCredits: isDirector ? 850000 : 0
    });

    setRecentTransactions([
      { key: '1', id: 'TXN-001', customer: 'Alhaji Musa Jennings', amount: 120000, status: 'APPROVED', type: 'CASH', date: '2026-07-04' },
      { key: '2', id: 'TXN-002', customer: 'Chidi Okafor Corp', amount: 450000, status: 'PENDING', type: 'CREDIT', date: '2026-07-04' },
      { key: '3', id: 'TXN-003', customer: 'Emeka & Sons', amount: 85000, status: 'APPROVED', type: 'TRANSFER', date: '2026-07-03' },
    ]);
  }, [isDirector]);

  // Table columns definition
  const columns = [
    { title: 'Txn ID', dataIndex: 'id', key: 'id' },
    { title: 'Customer/Buyer', dataIndex: 'customer', key: 'customer' },
    { 
      title: 'Amount', 
      dataIndex: 'amount', 
      key: 'amount',
      render: (amount) => `₦${amount.toLocaleString()}`
    },
    { title: 'Type', dataIndex: 'type', key: 'type' },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status) => (
        <Tag color={status === 'APPROVED' ? 'green' : 'gold'}>
          {status}
        </Tag>
      )
    },
    { title: 'Date', dataIndex: 'date', key: 'date' }
  ];

  return (
    <div style={{ padding: '4px' }}>
      <Space direction="vertical" size="large" style={{ width: 100 + '%' }}>
        
        {/* Header section welcoming the logged in user */}
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={2}>Welcome back, {user?.identifier || 'User'}</Title>
            <Text type="secondary">Here is an overview of Chinasaventures Ledger today.</Text>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} size="large">
              Record New Sale
            </Button>
          </Col>
        </Row>

        {/* Stats Grid - Automatically changes layout based on role */}
        <Row gutter={[16, 16]}>
          {isDirector && (
            <>
              <Col xs={24} sm={12} lg={6}>
                <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <Statistic title="Total Revenue" value={stats.totalRevenue} prefix="₦" valueStyle={{ color: '#3f8600' }} />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <Statistic title="Outstanding Credits" value={stats.outstandingCredits} prefix="₦" valueStyle={{ color: '#cf1322' }} />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <Statistic title="Pending Approvals" value={stats.pendingApprovals} valueStyle={{ color: '#d46b08' }} />
                </Card>
              </Col>
            </>
          )}
          
          <Col xs={24} sm={12} lg={isDirector ? 6 : 24}>
            <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <Statistic title="Today's Logged Transactions" value={stats.todaySalesCount} />
            </Card>
          </Col>
        </Row>

        {/* Recent Transactions Table */}
        <Card title="Recent Ledger Entries" bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <Table dataSource={recentTransactions} columns={columns} pagination={false} />
        </Card>

      </Space>
    </div>
  );
};

export default DashboardPage;