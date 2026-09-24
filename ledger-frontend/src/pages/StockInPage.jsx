import React, { useState, useEffect, useMemo } from "react";
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
  Select,
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

const StockInPage = () => {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [stockInRecords, setStockInRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Local (non-shared) date filter -- this page doesn't display monetary
  // values, so it's deliberately NOT wired into FilterContext, which was
  // built specifically for money pages. Defaults to showing everything
  // rather than "today", since a delivery log is more often scanned
  // broadly than checked for a single day.
  const [filterMode, setFilterMode] = useState("single");
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

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [stockInRes, productsRes, variantsRes] = await Promise.all([
        api.get("/stock_in"),
        api.get("/products"),
        api.get("/product-variants"),
      ]);

      const mapped = stockInRes.data.map((s) => ({
        key: s.id,
        id: s.id,
        itemName: s.productVariant
          ? `${s.productVariant.product?.name ?? ""} (${s.productVariant.producer ?? ""} ${s.productVariant.size ?? ""})`
          : s.product?.name ?? "—",
        quantity: s.quantity,
        branchName: s.branchName,
        truckNumber: s.truckNumber,
        deliveryNoteNumber: s.deliveryNoteNumber,
        supplierName: s.supplierName,
        note: s.note,
        recordedBy: s.recordedBy?.name ?? "—",
        date: s.createdAt,
      }));

      setStockInRecords(mapped);
      setProducts(productsRes.data);
      setVariants(variantsRes.data);
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

  // Same flatten-products-and-variants-into-one-picker pattern already
  // established in TransactionsPage's sale cart -- a variant-less product
  // is one option, a product WITH variants contributes one option per
  // variant instead.
  const sellableOptions = useMemo(() => {
    const options = [];
    products.forEach((p) => {
      const productVariants = variants.filter(
        (v) => v.product && v.product.id === p.id,
      );
      if (productVariants.length === 0) {
        options.push({
          value: `product-${p.id}`,
          label: `${p.name} (${p.unit})`,
          productId: p.id,
          productVariantId: null,
        });
      } else {
        productVariants.forEach((v) => {
          options.push({
            value: `variant-${v.id}`,
            label: `${p.name} — ${v.producer ?? ""} ${v.size}`,
            productId: null,
            productVariantId: v.id,
          });
        });
      }
    });
    return options;
  }, [products, variants]);

  const handleCreateStockIn = async (values) => {
    setSubmitting(true);
    try {
      const option = sellableOptions.find((o) => o.value === values.sellableOption);
      if (!option) {
        message.error("Select a valid product or variant.");
        setSubmitting(false);
        return;
      }

      await api.post("/stock_in", {
        product: option.productId ? { id: option.productId } : null,
        productVariant: option.productVariantId ? { id: option.productVariantId } : null,
        quantity: values.quantity,
        truckNumber: values.truckNumber || null,
        deliveryNoteNumber: values.deliveryNoteNumber || null,
        supplierName: values.supplierName || null,
        note: values.note || null,
      });

      message.success("Stock recorded — quantities updated.");
      form.resetFields();
      setIsModalOpen(false);
      fetchAll();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else if (error.response.status === 400) {
        message.error(error.response.data?.message || "Invalid stock-in entry.");
      } else {
        message.error(`Failed to save: ${error.response.status}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const performDelete = async (id) => {
    try {
      await api.delete(`/stock_in/${id}`);
      message.success("Stock-in record deleted — stock reversed.");
      fetchAll();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server. Is the backend running?");
      } else if (error.response.status === 403) {
        message.error("Only a director can delete a stock-in record.");
      } else {
        message.error(`Failed to delete: ${error.response.status}`);
      }
    }
  };

  // Immutable-record philosophy, same as everywhere else in this app —
  // deleting reverses the stock it added (see StockInService), so this
  // warning is accurate, not just boilerplate.
  const handleDelete = (record) => {
    Modal.confirm({
      title: "Delete this stock-in record?",
      content: `${record.itemName} — ${record.quantity} units. This reverses the stock it added. This cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      onOk: () => performDelete(record.id),
    });
  };

  const getFilteredRecords = (records) => {
    if (filterMode === "single" && singleDate) {
      return records.filter((r) => dayjs(r.date).isSame(singleDate, "day"));
    }
    if (filterMode === "range" && dateRange) {
      return records.filter((r) =>
        dayjs(r.date).isBetween(dateRange[0], dateRange[1], "day", "[]"),
      );
    }
    return records;
  };

  const getSearchedRecords = (records) => {
    if (!searchText.trim()) return records;
    const text = searchText.trim().toLowerCase();
    return records.filter(
      (r) =>
        r.itemName.toLowerCase().includes(text) ||
        (r.truckNumber ?? "").toLowerCase().includes(text) ||
        (r.supplierName ?? "").toLowerCase().includes(text) ||
        (r.deliveryNoteNumber ?? "").toLowerCase().includes(text),
    );
  };

  const dateFilteredRecords = getFilteredRecords(stockInRecords);
  const tableRecords = getSearchedRecords(dateFilteredRecords);

  const totalUnitsReceived = dateFilteredRecords.reduce((sum, r) => sum + r.quantity, 0);

  const columns = [
    { title: "Item", dataIndex: "itemName", key: "itemName" },
    { title: "Quantity", dataIndex: "quantity", key: "quantity" },
    { title: "Branch", dataIndex: "branchName", key: "branchName" },
    { title: "Truck #", dataIndex: "truckNumber", key: "truckNumber", render: (v) => v || "—" },
    { title: "Delivery Note #", dataIndex: "deliveryNoteNumber", key: "deliveryNoteNumber", render: (v) => v || "—" },
    { title: "Supplier", dataIndex: "supplierName", key: "supplierName", render: (v) => v || "—" },
    { title: "Recorded By", dataIndex: "recordedBy", key: "recordedBy" },
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (date) => formatDate(date),
    },
    ...(isDirector
      ? [
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
        ]
      : []),
  ];

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Stock In
            </Title>
            <Text type="secondary">
              Record goods received from suppliers.
            </Text>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsModalOpen(true)}
            >
              Record Stock In
            </Button>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={8}>
            <Card variant="plain">
              <Statistic title="Deliveries Shown" value={dateFilteredRecords.length} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={8}>
            <Card variant="plain">
              <Statistic title="Total Units Received" value={totalUnitsReceived} />
            </Card>
          </Col>
        </Row>

        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Segmented
              options={["Single", "Range"]}
              value={filterMode === "single" ? "Single" : "Range"}
              onChange={(val) => setFilterMode(val === "Single" ? "single" : "range")}
            />
            <Divider orientation="vertical" />
            {filterMode === "single" ? (
              <DatePicker value={singleDate} onChange={(date) => setSingleDate(date)} allowClear />
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
              placeholder="Search by item, truck #, supplier, delivery note #"
              style={{ width: 300 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
        </Row>

        {errorMsg && <Text type="danger">{errorMsg}</Text>}

        <Row>
          <Card title="Stock-In Records" variant="plain" style={{ width: "100%" }}>
            <Table
              dataSource={tableRecords}
              columns={columns}
              pagination={false}
              scroll={{ x: true }}
              loading={loading}
            />
          </Card>
        </Row>
      </Space>

      <Modal
        title="Record Stock In"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateStockIn}>
          <Form.Item
            label="Product / Variant"
            name="sellableOption"
            rules={[{ required: true, message: "Select what's being received" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select product or variant"
              options={sellableOptions}
            />
          </Form.Item>

          <Form.Item
            label="Quantity"
            name="quantity"
            rules={[{ required: true, message: "Quantity is required" }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} placeholder="e.g. 50" />
          </Form.Item>

          <Form.Item label="Truck Number" name="truckNumber">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item label="Delivery Note Number" name="deliveryNoteNumber">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item label="Supplier Name" name="supplierName">
            <Input placeholder="Optional" />
          </Form.Item>

          <Form.Item label="Note" name="note">
            <Input.TextArea rows={2} placeholder="Optional" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Save Stock In
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default StockInPage;