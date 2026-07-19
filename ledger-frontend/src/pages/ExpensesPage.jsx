import React, { useState, useEffect } from "react";
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Typography,
  Button,
  Space,
  Divider,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  DatePicker,
  Segmented,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";
import Search from "antd/es/input/Search";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

const { Title, Text } = Typography;

const ExpensesPage = () => {
  const { user } = useAuth();

  const [expenseRecord, setExpenseRecord] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [filterMode, setFilterMode] = useState("single"); // "single" | "range"
  const [singleDate, setSingleDate] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  const [searchText, setSearchText] = useState("");

  const formatDate = (isoString) => {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const fetchExpenses = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await api.get("/expenses");
      const mapped = response.data.map((exp) => ({
        key: exp.id,
        id: exp.id,
        description: exp.description,
        amount: exp.amount,
        recordedBy: exp.recordedBy?.name ?? "—",
        branch: exp.branch?.name ?? "—",
        date: exp.createdAt,
      }));
      setExpenseRecord(mapped);
    } catch (error) {
      if (!error.response) {
        setErrorMsg("Can't reach the server. Is the backend running?");
      } else {
        setErrorMsg(`Server error: ${error.response.status}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleCreateExpense = async (values) => {
    setSubmitting(true);
    try {
      await api.post("/expenses", {
        description: values.description,
        amount: values.amount,
      });
      message.success("Expense recorded!");
      form.resetFields();
      setIsModalOpen(false);
      fetchExpenses();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else {
        message.error(`Failed to save: ${error.response.status}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const performDelete = async (id) => {
    try {
      await api.delete(`/expenses/${id}`);
      message.success("Expense deleted.");
      fetchExpenses();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else {
        message.error(`Failed to delete: ${error.response.status}`);
      }
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: "Delete this expense?",
      content: `${record.description} — ₦${record.amount.toLocaleString()}. This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      onOk: () => performDelete(record.id),
    });
  };

  const getFilteredExpenses = (expenses) => {
    if (filterMode === "single" && singleDate) {
      return expenses.filter((e) => dayjs(e.date).isSame(singleDate, "day"));
    }
    if (filterMode === "range" && dateRange) {
      return expenses.filter((e) =>
        dayjs(e.date).isBetween(dateRange[0], dateRange[1], "day", "[]"),
      );
    }
    return expenses;
  };

  const getSearchedExpenses = (expenses) => {
    if (!searchText.trim()) return expenses;
    const text = searchText.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        e.description.toLowerCase().includes(text) ||
        String(e.id).includes(text),
    );
  };

  const computeStats = (expenses) => {
    const count = expenses.length;
    const totalValue = expenses.reduce((sum, e) => sum + e.amount, 0);
    const average = count === 0 ? 0 : totalValue / count;
    return { count, totalValue, average };
  };

  const getPeriodLabel = () => {
    if (filterMode === "range" && dateRange) {
      return `Expenses (${dateRange[0].format("DD MMM")} – ${dateRange[1].format("DD MMM")})`;
    }
    if (filterMode === "single" && singleDate) {
      return `Expenses on ${singleDate.format("DD MMM YYYY")}`;
    }
    return "All Expenses";
  };

  const dateFilteredExpenses = getFilteredExpenses(expenseRecord);
  const tableExpenses = getSearchedExpenses(dateFilteredExpenses);
  const stats = computeStats(dateFilteredExpenses);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Description", dataIndex: "description", key: "description" },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => `₦${amount.toLocaleString()}`,
    },
    { title: "Recorded By", dataIndex: "recordedBy", key: "recordedBy" },
    { title: "Branch", dataIndex: "branch", key: "branch" },
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date) => formatDate(date),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(record)}
        />
      ),
    },
  ];

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Expenses
            </Title>
            <Text type="secondary">
              Track and record business expenses.
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalOpen(true)}
            >
              Record Expense
            </Button>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Card variant="plain">
              <Statistic title={getPeriodLabel()} value={stats.count} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card variant="plain">
              <Statistic
                title="Total Expense Value"
                value={stats.totalValue}
                prefix="₦"
                styles={{ content: { color: "#cf1322" } }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card variant="plain">
              <Statistic
                title="Avg. Expense"
                value={stats.average}
                precision={2}
                prefix="₦"
                styles={{ content: { color: "#d46b08" } }}
              />
            </Card>
          </Col>
        </Row>

        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Segmented
              options={["Single", "Range"]}
              value={filterMode === "single" ? "Single" : "Range"}
              onChange={(val) =>
                setFilterMode(val === "Single" ? "single" : "range")
              }
            />
            <Divider orientation="vertical" />
            {filterMode === "single" ? (
              <DatePicker
                value={singleDate}
                onChange={(date) => setSingleDate(date)}
                allowClear
              />
            ) : (
              <DatePicker.RangePicker
                value={dateRange}
                onChange={(dates) => setDateRange(dates)}
                allowClear
              />
            )}
          </Col>
          <Col>
            <Search
              placeholder="Search by description or ID"
              style={{ width: 240 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
        </Row>

        {errorMsg && <Text type="danger">{errorMsg}</Text>}

        <Row>
          <Card title="Recorded Expenses" variant="plain" style={{ width: "100%" }}>
            <Table
              dataSource={tableExpenses}
              columns={columns}
              pagination={false}
              scroll={{ x: true }}
              loading={loading}
            />
          </Card>
        </Row>
      </Space>

      <Modal
        title="Record Expense"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateExpense}>
          <Form.Item
            label="Description"
            name="description"
            rules={[{ required: true, message: "Description is required" }]}
          >
            <Input placeholder="e.g. Fuel for delivery truck" />
          </Form.Item>

          <Form.Item
            label="Amount (₦)"
            name="amount"
            rules={[{ required: true, message: "Amount is required" }]}
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 15000"
            />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Save Expense
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ExpensesPage;