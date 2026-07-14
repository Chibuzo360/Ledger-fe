import React, { useState, useEffect } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Space,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { Pie, Column } from "@ant-design/charts";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";

const { Title, Text } = Typography;

const DashboardPage = () => {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingApprovals: 0,
    todaySalesCount: 0,
    outstandingCredits: 0,
    totalExpenses: 0,
  });

  const [recentTransactions, setRecentTransactions] = useState([]);
  const [salesByProduct, setSalesByProduct] = useState([]);
  const [weeklySales, setWeeklySales] = useState([]);
  const [productStockLevel, setProductStockLevel] = useState([]);

  useEffect(() => {
    // Mock data for now — we'll replace with real API calls later
    // useEffect runs anyfunction inside it on mounting or change unless the comoponent is specified
    setStats({
      totalRevenue: isDirector ? 4500000 : 0,
      pendingApprovals: isDirector ? 5 : 0,
      todaySalesCount: 12,
      outstandingCredits: isDirector ? 850000 : 0,
      totalExpenses: isDirector ? 320000 : 0,
    });

    setRecentTransactions([
      {
        key: "1",
        id: "TXN-001",
        customer: "Alhaji Musa",
        amount: 120000,
        status: "confirmed",
        type: "full",
        date: "2026-07-04",
      },
      {
        key: "2",
        id: "TXN-002",
        customer: "Chidi Okafor",
        amount: 450000,
        status: "pending",
        type: "credit",
        date: "2026-07-04",
      },
      {
        key: "3",
        id: "TXN-003",
        customer: "Emeka & Sons",
        amount: 85000,
        status: "confirmed",
        type: "part_payment",
        date: "2026-07-03",
      },
    ]);

    setSalesByProduct([
      { type: "Cement", value: 40 },
      { type: "Tiles", value: 25 },
      { type: "Rods", value: 15 },
      { type: "Doors", value: 10 },
      { type: "Binding Wire", value: 6 },
      { type: "Nails", value: 4 },
    ]);

    setWeeklySales([
      { day: "Mon", sales: 850000 },
      { day: "Tue", sales: 1200000 },
      { day: "Wed", sales: 650000 },
      { day: "Thu", sales: 1500000 },
      { day: "Fri", sales: 900000 },
      { day: "Sat", sales: 400000 },
    ]);

    setProductStockLevel([
      { category: "Cement", type: "Supaset", inStock: 167500 },
      { category: "Cement", type: "Dangote", inStock: 237500 },
      { category: "Cement", type: "Unicem", inStock: 123300 },
      { category: "Cement", type: "Blockmaster", inStock: 132500 },
      { category: "Rod", type: "IGS16", inStock: 342100 },
      { category: "Rod", type: "IGS12", inStock: 164530 },
      { category: "Rod", type: "IGS8", inStock: 132500 },
      { category: "Rod", type: "IGS10", inStock: 124500 },
      { category: "Rod", type: "TNT16", inStock: 457500 },
      { category: "Nails", type: "4inc", inStock: 137500 },
      { category: "Nails", type: "2inc", inStock: 165500 },
    ]);
  }, [isDirector]);

  const columns = [
    { title: "Txn ID", dataIndex: "id", key: "id" },
    { title: "Customer", dataIndex: "customer", key: "customer" },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => `₦${amount.toLocaleString()}`,
    },
    { title: "Type", dataIndex: "type", key: "type" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => (
        <Tag
          color={
            status === "confirmed"
              ? "green"
              : status === "pending"
                ? "gold"
                : "blue"
          }
        >
          {status.toUpperCase()}
        </Tag>
      ),
    },
    { title: "Date", dataIndex: "date", key: "date" },
  ];

  const pieConfig = {
    data: salesByProduct,
    angleField: "value",
    colorField: "type",
    radius: 0.8,
    legend: {
        color:{
          position: 'right',
          layout: {
            justifyContent: 'center',
            flexDirection: 'column',
          }
        }
      },
    label: {
      type: "outer",
      formatter: (datum) => {
        const percent = datum.percentage ?? datum.percent;
        const percentText =
          typeof percent === "number" ? `${(percent * 100).toFixed(0)}%` : "";
        return `${datum.type} ${percentText}`.trim();
      },
      
    },
    interactions: [{ type: "element-active" }],
  };

  const barConfig = {
    data: weeklySales,
    xField: "day",
    yField: "sales",
    color: "#1890ff",
    // label: {
    //   position: 'top',
    //   formatter: (datum) => `₦${(datum.sales / 1000).toFixed(0)}k`,
    // },
    xAxis: { label: { autoHide: true } },
    yAxis: {
      label: {
        formatter: (v) => `₦${(v / 1000).toFixed(0)}k`,
      },
    },
  };

  {
    /* the groupBarconfig is incomplete at the moment. */
  }
  const groupBarConfig = {
    data: productStockLevel,
    isGroup: true,
    xField: "category",
    yField: "inStock",
    seriesField: "type",
    groupField: "type",
    colorField: "category",
  };

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        {/* Header */}
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Welcome back, {user?.identifier || "User"} 👋
            </Title>
            <Text type="secondary">
              Here is an overview of CAV Ledger today.
            </Text>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />}>
              Record New Sale
            </Button>
          </Col>
        </Row>

        {/* Stats Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="plain">
              <Statistic
                title="Today's Transactions"
                value={stats.todaySalesCount}
              />
            </Card>
          </Col>

          {isDirector && (
            <>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Total Revenue"
                    value={stats.totalRevenue}
                    prefix="₦"
                    styles={{ content: { color: "#3f8600" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Total Expenses"
                    value={stats.totalExpenses}
                    prefix="₦"
                    styles={{ content: { color: "#cf1322" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Outstanding Credits"
                    value={stats.outstandingCredits}
                    prefix="₦"
                    styles={{ content: { color: "#d46b08" } }}
                  />
                </Card>
              </Col>
            </>
          )}
        </Row>

        {/* Charts — Director only */}
        {isDirector && (
          <Row gutter={[16, 16]}>
            <Col xs={48} lg={15}>
              {/* Testing grouped chart */}
              {/*The heigh of the chart will be made dynamic later*/}
              <Card title="Grouped chart (₦)" variant="plain">
                <Column {...groupBarConfig} height={505} /> 
              </Card>
            </Col>
            <Col xs={12} lg={9}>
              <Card title="Sales by Product Category" variant="plain">
                <Pie {...pieConfig} height={200} />
              </Card>
              <Card title="Weekly Sales (₦)" variant="plain">
                <Column {...barConfig} height={200} />
              </Card>
            </Col>
          </Row>
        )}

        {/* Recent Transactions */}
        <Card title="Recent Transactions" variant="plain">
          <Table
            dataSource={recentTransactions}
            columns={columns}
            pagination={false}
            scroll={{ x: true }}
          />
        </Card>
      </Space>
    </div>
  );
};

export default DashboardPage;
