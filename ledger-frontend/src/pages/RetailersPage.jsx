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

const RetailersPage = () => {
  const { user } = useAuth();

  const [retailRecord, setRetailRecord] = useState([]);
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

  const fetchRetailers = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await api.get("/retailers");
      const mapped = response.data.map((retailer) => ({
        key: retailer.id,
        id: retailer.id,
        businessName: retailer.businessName,
        contactName: retailer.contactName,
        email: retailer.email,
        phone: retailer.phone,
        creditLimit: retailer.creditLimit,
        balance: retailer.balance,
        address: retailer.address,
        branch: retailer.branch?.name ?? "—",
        date: retailer.createdAt
      }));
      setRetailRecord(mapped);
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
    fetchRetailers();
  }, []);

  const handleAddRetailer = async (values) => {
    setSubmitting(true);
    try {
      await api.post("/retailers", {
        contactName: values.contactName,
        businessName: values.businessName,
        phone: values.phone,
        address: values.address,
        balance: values.balance,
      });
      // The next version(if any), will have a feature that auto-calculates retailers balance from the transactions record
      // it will also be able to track retailers orders and details
      // will adding a description table at the backend stry from my mvp?, does the current state of this retailer page work or will it need whole tables for each retailers which will be a big problem
      message.success("Retailer Added!");
      form.resetFields();
      setIsModalOpen(false);
      fetchRetailers();
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
      await api.delete(`/retailers/${id}`);
      message.success("Retailer record deleted.");
      fetchRetailers();
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
      title: "Are you sure you want to delete this retailer's record?",
      content: `${record.description} — ₦${record.amount.toLocaleString()}. This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      onOk: () => performDelete(record.id),
    });
  };

  const getFilteredRetailers = (retailers) => {
    if (filterMode === "single" && singleDate) {
      return retailers.filter((e) => dayjs(e.date).isSame(singleDate, "day"));
    }
    if (filterMode === "range" && dateRange) {
      return retailers.filter((e) =>
        dayjs(e.date).isBetween(dateRange[0], dateRange[1], "day", "[]"),
      );
    }
    return retailers;
  };

  const getSearchedRetailer = (retailers) => {
    if (!searchText.trim()) return retailers;
    const text = searchText.trim().toLowerCase();
    return retailers.filter(
      (e) =>
        e.description.toLowerCase().includes(text) ||
        String(e.id).includes(text),
    );
  };

  const computeStats = (retailers) => {
    const count = retailers.length;
    const totalValue = retailers.reduce((sum, e) => sum + e.amount, 0);
    const average = count === 0 ? 0 : totalValue / count;
    return { count, totalValue, average };
  };

  const getPeriodLabel = () => {
    if (filterMode === "range" && dateRange) {
      return `Expenses (${dateRange[0].format("DD MMM")} – ${dateRange[1].format("DD MMM")})`;
    }
    if (filterMode === "single" && singleDate) {
      return `Retailers on ${singleDate.format("DD MMM YYYY")}`;
    }
    return "All Expenses";
  };

  const dateFilteredRetailers = getFilteredRetailers(retailRecord);
  const tableRetailers = getSearchedRetailer(dateFilteredRetailers);
  const stats = computeStats(dateFilteredRetailers);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Business Name", dataIndex: "businessName", key: "businessName" },
    { title: "Email", dataIndex:"email", key: "email"},
    { title: "Phone", dataIndex:"phone", key: "phone"},
    { title: "Credit Limit", dataIndex:"creditLimit", key: "creditLimit"},
    {
      title: "Balance",
      dataIndex: "balance",
      key: "balance",
      render: (amount) => `₦${amount.toLocaleString()}`,
    },
    { title: "Address", dataIndex: "address", key: "address" },
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
              Retailers
            </Title>
            <Text type="secondary">
              Track and record business retailers.
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
              dataSource={tableRetailers}
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
        <Form form={form} layout="vertical" onFinish={handleAddRetailer}>
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
            <Button type="primary" htmlType="submit" loading={submitting} block>``
              Save Expense
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RetailersPage;