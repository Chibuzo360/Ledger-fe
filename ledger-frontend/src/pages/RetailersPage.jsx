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
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Descriptions,
  Tag,
  Divider,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import api from "../api/axiosConfig";

const { Title, Text } = Typography;

const RetailersPage = () => {
  const [retailers, setRetailers] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedRetailer, setSelectedRetailer] = useState(null);
  const [retailerItems, setRetailerItems] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const formatDate = (isoString) => {
    if (!isoString) return "—";
    return new Date(isoString).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [retailersRes, transactionsRes] = await Promise.all([
        api.get("/retailers"),
        api.get("/transactions"),
      ]);
      setRetailers(retailersRes.data);
      setAllTransactions(transactionsRes.data);
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
    fetchAll();
  }, []);

  // Amount Owed = money the retailer owes us. Derived, not stored — same
  // pattern as the dashboard stats. Sums (totalAmount - amountPaid) across
  // every transaction linked to this retailer.

  const getAmountOwed = (retailerId) => {
    return allTransactions
      .filter((t) => t.retailer?.id === retailerId)
      .reduce((sum, t) => sum + (t.totalAmount - t.amountPaid), 0);
  };

  const getAvailableCredit = (retailer)=>{
      return retailer.creditLimit-getAmountOwed(retailer.id)
  }

  const handleAddRetailer = async (values) => {
    setSubmitting(true);
    try {
      await api.post("/retailers", {
        businessName: values.businessName,
        contactName: values.contactName || null,
        phone: values.phone || null,
        address: values.address || null,
        creditLimit: values.creditLimit || 0,
      });
      message.success("Retailer added!");
      form.resetFields();
      setIsAddModalOpen(false);
      fetchAll();
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

  // Product Owed = goods we owe the retailer (they paid/ordered, we haven't
  // fully delivered). Fetched fresh per retailer via the new endpoint — one
  // request per detail view, not one per transaction.
  const openDetails = async (retailer) => {
    setSelectedRetailer(retailer);
    setIsDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const response = await api.get(`/transaction_item/retailer/${retailer.id}`);
      setRetailerItems(response.data);
    } catch (error) {
      message.error("Couldn't load this retailer's item history.");
      setRetailerItems([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  // Groups outstanding (not-yet-delivered) quantities by product/variant,
  // so the modal shows "Cement — 20 bags owed" instead of a raw item list.
  const getProductOwedSummary = () => {
    const outstanding = retailerItems.filter(
      (item) => item.quantityOrdered > item.quantitySupplied,
    );

    const grouped = {};
    outstanding.forEach((item) => {
      const label = item.productVariant
        ? `${item.product?.name ?? "Unknown"} (${item.productVariant.size ?? ""} ${item.productVariant.producer ?? ""})`.trim()
        : item.product?.name ?? "Unknown product";

      const owedQty = item.quantityOrdered - item.quantitySupplied;
      const owedQtyValue = owedQty * (item.productVariant?.pricePerUnit?? item.product?.pricePerUnit?? 0)
      grouped[label] = (grouped[label] || 0) + owedQty;
    });

    return Object.entries(grouped).map(([label, qty]) => ({ label, qty }));
  };

  const retailerTransactions = selectedRetailer
    ? allTransactions.filter((t) => t.retailer?.id === selectedRetailer.id)
    : [];

  const columns = [
    { title: "Business Name", dataIndex: "businessName", key: "businessName" },
    { title: "Contact", dataIndex: "contactName", key: "contactName" },
    { title: "Phone", dataIndex: "phone", key: "phone" },
    {
      title: "Credit Limit",
      dataIndex: "creditLimit",
      key: "creditLimit",
      render: (val) => `₦${(val ?? 0).toLocaleString()}`,
    },
    // this column should warn in the future when credit limit is exceeded
    {
      title: "Available Credit",
      dataIndex: "availableCredit",
      render: (_,record) =>{
        const available = getAvailableCredit(record);
        return(
          <Text type={available < 0 ? "danger" : "undefined"}>
            ₦{available.toLocaleString()}
          </Text>
        )
      },
    },
    {
      title: "Amount Owed",
      key: "amountOwed",
      render: (_, record) => {
        const owed = getAmountOwed(record.id);
        return (
          <Text type={owed > 0 ? "danger" : "success"}>
            ₦{owed.toLocaleString()}
          </Text>
        );
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Button type="link" onClick={() => openDetails(record)}>
          Details
        </Button>
      ),
    },
  ];

  const transactionColumns = [
    { title: "Txn ID", dataIndex: "id", key: "id" },
    {
      title: "Total",
      dataIndex: "totalAmount",
      key: "totalAmount",
      render: (v) => `₦${v.toLocaleString()}`,
    },
    {
      title: "Paid",
      dataIndex: "amountPaid",
      key: "amountPaid",
      render: (v) => `₦${v.toLocaleString()}`,
    },
    {
      title: "Status",
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      render: (status) => (
        <Tag color={status === "confirmed" ? "green" : "gold"}>
          {status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Date",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (d) => formatDate(d),
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
              Repeat customers with running credit accounts.
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Retailer
            </Button>
          </Col>
        </Row>

        {errorMsg && <Text type="danger">{errorMsg}</Text>}

        <Row>
          <Card variant="plain" style={{ width: "100%" }}>
            <Table
              dataSource={retailers.map((r) => ({ ...r, key: r.id }))}
              columns={columns}
              pagination={false}
              scroll={{ x: true }}
              loading={loading}
            />
          </Card>
        </Row>
      </Space>

      <Modal
        title="Add Retailer"
        open={isAddModalOpen}
        onCancel={() => {
          setIsAddModalOpen(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleAddRetailer}>
          <Form.Item
            label="Business Name"
            name="businessName"
            rules={[{ required: true, message: "Business name is required" }]}
          >
            <Input placeholder="e.g. Musa Building Supplies" />
          </Form.Item>

          <Form.Item label="Contact Name" name="contactName">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item label="Phone" name="phone">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item label="Address" name="address">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item label="Credit Limit (₦)" name="creditLimit">
            <InputNumber min={0} style={{ width: "100%" }} placeholder="e.g. 500000" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Save Retailer
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={selectedRetailer?.businessName ?? "Retailer Details"}
        open={isDetailsOpen}
        onCancel={() => setIsDetailsOpen(false)}
        footer={[
          <Button key="close" onClick={() => setIsDetailsOpen(false)}>
            Close
          </Button>,
        ]}
        width={700}
      >
        {selectedRetailer && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Contact">
                {selectedRetailer.contactName || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {selectedRetailer.phone || "—"}
              </Descriptions.Item>
              <Descriptions.Item label="Credit Limit">
                ₦{(selectedRetailer.creditLimit ?? 0).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Amount Owed">
                ₦{getAmountOwed(selectedRetailer.id).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" style={{ marginTop: 20 }}>
              Product Owed
            </Divider>
            {detailsLoading ? (
              <Text type="secondary">Loading...</Text>
            ) : getProductOwedSummary().length === 0 ? (
              <Text type="secondary">Nothing outstanding — fully delivered.</Text>
            ) : (
              <ul>
                {getProductOwedSummary().map((row) => (
                  <li key={row.label}>
                    {row.label}: <b>{row.qty}</b> owed
                  </li>
                ))}
              </ul>
            )}

            <Divider orientation="left">Transaction History</Divider>
            <Table
              dataSource={retailerTransactions.map((t) => ({ ...t, key: t.id }))}
              columns={transactionColumns}
              pagination={false}
              scroll={{ x: true }}
              size="small"
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default RetailersPage;