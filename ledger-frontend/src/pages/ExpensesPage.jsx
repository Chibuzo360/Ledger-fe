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
  Divider,
  Dropdown,
} from "antd";
import {
  DownOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  setTwoToneColor,
} from "@ant-design/icons";
import { Pie, Column } from "@ant-design/charts";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";
import currentDayDate from "../components/CurrentDayDate";
import Input from "antd/es/input/Input";
import Search from "antd/es/input/Search";

const { Title, Text } = Typography;

const ExpensesPage = () => {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [stats, setStats] = useState({
    transactionsToday: 0,
    averageTransactionsToday: 0,
    transactionCount: 0,
    pendingTransactions: 0,
  });

  const menuItems = [
    { key: 1, label: "TransactionID" },
    { key: 2, label: "CustomerName" },
    { key: 3, label: "CustomerPhone" },
    { key: 4, label: "Amount" },
  ];

  const actionItems = [
    {key: 1, label: "Details"},
    {key: 2, label: "Delete"}
  ]

  const [transactionRecord, setTransactionRecord] = useState([]);
  const [filterDate, setFilterDate] = useState(currentDayDate());
  const [transactionActions, setTransactionActions] = useState(
    <Dropdown menu={{ items: actionItems }} trigger={"click"}>
              <Button style={{ width: 10 }} type="text">
                 <MoreOutlined/>
              </Button>
            </Dropdown>
  );

  const fetchExepenses=() =>{
    
  }

  useEffect(() => {
    setTransactionRecord([
      {
        key: "1",
        id: "TXN-001",
        customer: "Alhaji Musa",
        amount: 120000,
        amountPaid: 120000,
        status: "confirmed",
        type: "full",
        date: "2026-07-04",
        actions: transactionActions
      },
      {
        key: "2",
        id: "TXN-002",
        customer: "Chidi Okafor",
        amount: 450000,
        amountPaid: 0,
        status: "pending",
        type: "credit",
        date: "2026-07-04",
        actions: transactionActions
      },
      {
        key: "3",
        id: "TXN-003",
        customer: "Emeka & Sons",
        amount: 85000,
        amountPaid: 25000,
        status: "confirmed",
        type: "part_payment",
        date: "2026-07-03",
        actions: transactionActions
      },
    ]);
  },[]);

  const columns = [
    { title: "Txn ID", dataIndex: "id", key: "id" },
    { title: "Customer", dataIndex: "customer", key: "customer" },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => `₦${amount.toLocaleString()}`,
    },
    {
      title: "Amount_Paid",
      dataIndex: "amountPaid",
      key: "amountPaid",
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
    { title: "Actions", dataIndex: "actions", key: "actions" },
  ];

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        {/* Header */}
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Expenses Records
            </Title>
            <Text type="secondary">
              Here is an overview of today's transactions.
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
                value={stats.transactionsToday}
              />
            </Card>
          </Col>

          {isDirector && (
            <>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Average Amount per Transaction"
                    value={stats.averageTransactionsToday}
                    prefix="₦"
                    styles={{ content: { color: "#3f8600" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Total Transactions"
                    value={stats.transactionCount}
                    prefix="₦"
                    styles={{ content: { color: "#cf1322" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Pending Transactions"
                    value={stats.pendingTransactions}
                    prefix="₦"
                    styles={{ content: { color: "#d46b08" } }}
                  />
                </Card>
              </Col>
            </>
          )}
        </Row>

        {/*Table modifiers */}
        {/*The search 'onSearch' attribute will be added later */}
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Button>{filterDate}</Button>
            <Divider orientation="vertical" />
            <Button>Filter by</Button>
          </Col>
          <Col>
            <Dropdown menu={{ items: menuItems }} trigger={"click"}>
              <Button style={{ width: 100 }}>
                Search By <DownOutlined />
              </Button>
            </Dropdown>
            <Divider orientation="vertical" />
            <Search placeholder="Search transactions" style={{ width: 200 }} />
          </Col>
        </Row>

        {/*The transaction table */}
        <Row>
          <Card title="Recent Transactions" variant="plain" style={{ width: "100%" }} >
            <Table
              dataSource={transactionRecord}
              columns={columns}
              pagination={false}
              scroll={{ x: true }}
            />
          </Card>
        </Row>
      </Space>
    </div>
  );
};

export default ExpensesPage;
