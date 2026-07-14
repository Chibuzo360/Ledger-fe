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
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Checkbox,
  Descriptions,
  DatePicker,
  Segmented,
} from "antd";
import { DownOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";
import currentDayDate from "../components/CurrentDayDate";
import Search from "antd/es/input/Search";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

const { Title, Text } = Typography;

const TransactionsPage = () => {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const menuItems = [
    { key: 1, label: "TransactionID" },
    { key: 2, label: "CustomerName" },
    { key: 3, label: "CustomerPhone" },
    { key: 4, label: "Amount" },
  ];

  const [transactionRecord, setTransactionRecord] = useState([]);
  const [filterDate, setFilterDate] = useState(currentDayDate());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentForm] = Form.useForm();

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTxn, setDetailsTxn] = useState(null);

  const [filterMode, setFilterMode] = useState("single"); // "single" | "range"
  const [singleDate, setSingleDate] = useState(null); // dayjs object or null
  const [dateRange, setDateRange] = useState(null);

  const getFilteredTransactions = (transactions) => {
    if (filterMode === "single" && singleDate) {
      return transactions.filter((t) =>
        dayjs(t.date).isSame(singleDate, "day"),
      );
    }
    if (filterMode === "range" && dateRange) {
      return transactions.filter((t) =>
        dayjs(t.date).isBetween(dateRange[0], dateRange[1], "day", "[]"),
      );
    }
    return transactions; // no filter selected = show everything
  };

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

  // CHANGED: computeStats no longer filters for "today" internally — it now
  // just computes stats over WHATEVER array it's handed. This is what fixes
  // the range-mode zero bug: previously it re-filtered the already-filtered
  // range data down to "only today", which is empty unless today happens to
  // fall inside the picked range.
  const computeStats = (transactions) => {
    const count = transactions.length;

    const average =
      count === 0
        ? 0
        : transactions.reduce((sum, t) => sum + t.amount, 0) / count;

    const totalTransactionValue = transactions.reduce(
      (sum, t) => sum + t.amount,
      0,
    );

    const pendingTransactions = transactions.filter(
      (t) => t.status === "pending",
    ).length;

    return {
      transactionsToday: count,
      averageTransactionsToday: average,
      totalTransactionValue,
      pendingTransactions,
    };
  };

  // NEW: picks the label for the first stat card based on the active filter,
  // so the card title always matches what its number actually represents.
  const getPeriodLabel = () => {
    if (filterMode === "range" && dateRange) {
      return `Transactions (${dateRange[0].format("DD MMM")} – ${dateRange[1].format("DD MMM")})`;
    }
    if (filterMode === "single" && singleDate) {
      return `Transactions on ${singleDate.format("DD MMM YYYY")}`;
    }
    return "All Transactions"; // no filter picked = card matches the unfiltered table
  };

  const fetchTransactions = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await api.get("/transactions");
      const mapped = response.data.map((txn) => ({
        key: txn.id,
        id: txn.id,
        customer: txn.customerName,
        customerPhone: txn.customerPhone,
        amount: txn.totalAmount,
        amountPaid: txn.amountPaid,
        status: txn.paymentStatus,
        type: txn.paymentType,
        date: txn.createdAt,
        recordedBy: txn.recordedBy?.name ?? "—",
        confirmedBy: txn.confirmedBy?.name ?? "—",
        confirmedAt: txn.confirmedAt,
        paymentProof: txn.paymentProof,
      }));
      setTransactionRecord(mapped);
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
    fetchTransactions();
  }, []);

  const handleCreateTransaction = async (values) => {
    setSubmitting(true);
    try {
      await api.post("/transactions", {
        customerName: values.customerName,
        customerPhone: values.customerPhone || null,
        totalAmount: values.totalAmount,
        amountPaid: values.amountPaid,
        paymentStatus: values.alreadyConfirmed ? "confirmed" : undefined,
      });
      message.success("Transaction recorded!");
      form.resetFields();
      setIsModalOpen(false);
      fetchTransactions();
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

  const openPaymentModal = (record) => {
    setSelectedTxn(record);
    paymentForm.setFieldsValue({
      amountPaid: record.amountPaid,
      paymentProof: "",
    });
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (values) => {
    setPaymentSubmitting(true);
    try {
      await api.put(`/transactions/${selectedTxn.id}/confirm`, {
        amountPaid: values.amountPaid,
        paymentProof: values.paymentProof || null,
      });
      message.success("Payment updated!");
      setIsPaymentModalOpen(false);
      paymentForm.resetFields();
      fetchTransactions();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else {
        const backendMsg = error.response.data?.message || error.response.data;
        message.error(
          typeof backendMsg === "string"
            ? backendMsg
            : `Failed to update: ${error.response.status}`,
        );
      }
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const performDelete = async (id) => {
    try {
      await api.delete(`/transactions/${id}`);
      message.success("Transaction deleted.");
      fetchTransactions();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else if (error.response.status === 403) {
        message.error("Only a director can delete a confirmed transaction.");
      } else {
        message.error(`Failed to delete: ${error.response.status}`);
      }
    }
  };

  const handleDeleteLight = (record) => {
    Modal.confirm({
      title: "Delete this transaction?",
      content: `${record.customer} — ₦${record.amount.toLocaleString()}. This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      onOk: () => performDelete(record.id),
    });
  };

  const handleDeleteHeavy = (record) => {
    let typedValue = "";
    Modal.confirm({
      title: "Delete a CONFIRMED transaction?",
      icon: null,
      content: (
        <div>
          <Text type="danger">
            This transaction has already been confirmed. Deleting it removes a
            verified sale record permanently. Type <b>DELETE</b> below to
            proceed.
          </Text>
          <Input
            style={{ marginTop: 12 }}
            placeholder="Type DELETE to confirm"
            onChange={(e) => (typedValue = e.target.value)}
          />
        </div>
      ),
      okText: "Delete",
      okType: "danger",
      onOk: () => {
        if (typedValue !== "DELETE") {
          message.error('You must type "DELETE" exactly to proceed.');
          return Promise.reject();
        }
        return performDelete(record.id);
      },
    });
  };

  const openDetails = (record) => {
    setDetailsTxn(record);
    setIsDetailsOpen(true);
  };

  const renderActions = (_, record) => {
    const items = [{ key: "details", label: "Details" }];

    if (record.status !== "confirmed") {
      items.push({ key: "update", label: "Update Payment" });
      items.push({ key: "delete", label: "Delete", danger: true });
    } else if (isDirector) {
      items.push({ key: "delete", label: "Delete (confirmed)", danger: true });
    }

    const onClick = ({ key }) => {
      if (key === "details") openDetails(record);
      if (key === "update") openPaymentModal(record);
      if (key === "delete") {
        record.status === "confirmed"
          ? handleDeleteHeavy(record)
          : handleDeleteLight(record);
      }
    };

    return (
      <Dropdown menu={{ items, onClick }} trigger={["click"]}>
        <Button style={{ width: 10 }} type="text">
          <MoreOutlined />
        </Button>
      </Dropdown>
    );
  };

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
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date) => formatDate(date),
    },
    { title: "Actions", key: "actions", render: renderActions },
  ];

  // Both derived here, once per render, from current filter state.
  // filteredTransactions feeds the Table; stats feeds the cards.
  const filteredTransactions = getFilteredTransactions(transactionRecord);
  const stats = computeStats(filteredTransactions);

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Transaction Records
            </Title>
            <Text type="secondary">
              Here is an overview of today's transactions.
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalOpen(true)}
            >
              Record New Sale
            </Button>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card variant="plain">
              <Statistic
                title={getPeriodLabel()}
                value={stats.transactionsToday}
              />
            </Card>
          </Col>

          {isDirector && (
            <>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Avg. Amount per Transaction"
                    value={stats.averageTransactionsToday}
                    prefix="₦"
                    precision={2}
                    styles={{ content: { color: "#3f8600" } }}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card variant="plain">
                  <Statistic
                    title="Total Transaction Value"
                    value={stats.totalTransactionValue}
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
                    styles={{ content: { color: "#d46b08" } }}
                  />
                </Card>
              </Col>
            </>
          )}
        </Row>

        <Row justify="space-between" align="middle" wrap>
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

        {errorMsg && <Text type="danger">{errorMsg}</Text>}

        <Row>
          <Card
            title="Recent Transactions"
            variant="plain"
            style={{ width: "100%" }}
          >
            <Table
              dataSource={filteredTransactions}
              columns={columns}
              pagination={false}
              scroll={{ x: true }}
              loading={loading}
            />
          </Card>
        </Row>
      </Space>

      <Modal
        title="Record New Sale"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateTransaction}>
          <Form.Item
            label="Customer Name"
            name="customerName"
            rules={[{ required: true, message: "Customer name is required" }]}
          >
            <Input placeholder="e.g. Alhaji Musa" />
          </Form.Item>

          <Form.Item label="Customer Phone" name="customerPhone">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item
            label="Total Amount (₦)"
            name="totalAmount"
            rules={[{ required: true, message: "Total amount is required" }]}
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 50000"
            />
          </Form.Item>

          <Form.Item
            label="Amount Paid (₦)"
            name="amountPaid"
            rules={[{ required: true, message: "Amount paid is required" }]}
          >
            <InputNumber
              min={0}
              style={{ width: "100%" }}
              placeholder="e.g. 50000"
            />
          </Form.Item>

          <Form.Item name="alreadyConfirmed" valuePropName="checked">
            <Checkbox>Payment already received (skip pending status)</Checkbox>
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Save Transaction
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Update Payment — ${selectedTxn?.customer ?? ""}`}
        open={isPaymentModalOpen}
        onCancel={() => {
          setIsPaymentModalOpen(false);
          paymentForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={paymentForm}
          layout="vertical"
          onFinish={handleConfirmPayment}
        >
          <Form.Item
            label="Amount Paid (₦)"
            name="amountPaid"
            rules={[{ required: true, message: "Amount paid is required" }]}
          >
            <InputNumber
              min={0}
              max={selectedTxn?.amount}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item label="Payment Proof (optional)" name="paymentProof">
            <Input placeholder="e.g. transfer reference, receipt no." />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={paymentSubmitting}
              block
            >
              Confirm Payment
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Transaction Details"
        open={isDetailsOpen}
        onCancel={() => setIsDetailsOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailsOpen(false)}>
            Close
          </Button>,
        ]}
      >
        {detailsTxn && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Customer">
              {detailsTxn.customer}
            </Descriptions.Item>
            <Descriptions.Item label="Phone">
              {detailsTxn.customerPhone || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Total Amount">
              ₦{detailsTxn.amount.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Amount Paid">
              ₦{detailsTxn.amountPaid.toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="Payment Type">
              {detailsTxn.type}
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              {detailsTxn.status}
            </Descriptions.Item>
            <Descriptions.Item label="Recorded By">
              {detailsTxn.recordedBy}
            </Descriptions.Item>
            <Descriptions.Item label="Confirmed By">
              {detailsTxn.confirmedBy}
            </Descriptions.Item>
            <Descriptions.Item label="Confirmed At">
              {formatDate(detailsTxn.confirmedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="Payment Proof">
              {detailsTxn.paymentProof || "—"}
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {formatDate(detailsTxn.date)}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default TransactionsPage;