import React, { useState, useEffect, useMemo } from "react";
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
  Select,
} from "antd";
import { DownOutlined, MoreOutlined, PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";
import currentDayDate from "../components/CurrentDayDate";
import Search from "antd/es/input/Search";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

const { Title, Text } = Typography;

const SEARCH_FIELD_MAP = {
  1: { key: "id", label: "Transaction ID" },
  2: { key: "customer", label: "Customer Name" },
  3: { key: "customerPhone", label: "Customer Phone" },
  4: { key: "amount", label: "Amount" },
};

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
  const [retailers, setRetailers] = useState([]);
  const [filterDate, setFilterDate] = useState(currentDayDate());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // NEW: product/variant catalog, needed to populate the sale cart's item
  // picker. Fetched alongside transactions/retailers — a failure here is
  // non-fatal to the rest of the page, since only the create-sale cart
  // depends on it.
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);

  // NEW: the sale cart. Plain state rather than an antd Form.List, since
  // each line carries computed display fields (unitPrice, displayName)
  // alongside the raw values — easier to reason about as ordinary objects
  // than fighting Form.List's field-array API for something this shape.
  const [cartItems, setCartItems] = useState([]);
  const [cartLineForm] = Form.useForm();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentForm] = Form.useForm();

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTxn, setDetailsTxn] = useState(null);

  const [filterMode, setFilterMode] = useState("single");
  const [singleDate, setSingleDate] = useState(null);
  const [dateRange, setDateRange] = useState(null);

  const [searchFieldKey, setSearchFieldKey] = useState(null);
  const [searchText, setSearchText] = useState("");

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
    return transactions;
  };

  const getSearchedTransactions = (transactions) => {
    if (!searchText.trim()) return transactions;
    const text = searchText.trim().toLowerCase();

    if (searchFieldKey) {
      const fieldKey = SEARCH_FIELD_MAP[searchFieldKey].key;
      return transactions.filter((t) =>
        String(t[fieldKey] ?? "")
          .toLowerCase()
          .includes(text),
      );
    }

    return transactions.filter(
      (t) =>
        String(t.id).includes(text) ||
        (t.customer ?? "").toLowerCase().includes(text) ||
        (t.customerPhone ?? "").toLowerCase().includes(text) ||
        String(t.amount).includes(text),
    );
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

  const getPeriodLabel = () => {
    if (filterMode === "range" && dateRange) {
      return `Transactions (${dateRange[0].format("DD MMM")} – ${dateRange[1].format("DD MMM")})`;
    }
    if (filterMode === "single" && singleDate) {
      return `Transactions on ${singleDate.format("DD MMM YYYY")}`;
    }
    return "All Transactions";
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
        phone: retailer.phone,
        creditLimit: retailer.creditLimit,
        balance: retailer.balance,
        branch: retailer.branch,
        createdAt: retailer.createdAt,
      }));
      setRetailers(mapped);
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

  // NEW: catalog fetch for the sale cart. Deliberately does not touch
  // `errorMsg` (the page-level error banner) or `loading` (the main
  // table's spinner) — a failure here shouldn't block viewing existing
  // transactions, it should only affect the "Record New Sale" modal.
  const fetchCatalog = async () => {
    try {
      const [productsRes, variantsRes] = await Promise.all([
        api.get("/products"),
        api.get("/product-variants"),
      ]);
      setProducts(productsRes.data);
      setVariants(variantsRes.data);
    } catch (error) {
      message.error("Couldn't load the product catalog for the sale form.");
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchRetailers();
    fetchCatalog();
  }, []);

  // NEW: flattens products + variants into one pickable list for the cart.
  // A variant-less product (e.g. Binding Wire) becomes one option using the
  // product's own price. A product WITH variants contributes one option per
  // variant instead (using that variant's price), and the bare product
  // itself is never directly sellable in that case — mirrors ProductsPage's
  // own rule that a variant-having product's price/stock live on the
  // variants, not the product row.
  const sellableOptions = useMemo(() => {
    const options = [];
    products.forEach((p) => {
      const productVariants = variants.filter(
        (v) => v.product && v.product.id === p.id,
      );
      if (productVariants.length === 0) {
        options.push({
          value: `product-${p.id}`,
          label: `${p.name} — ₦${p.pricePerUnit?.toLocaleString() ?? "-"} / ${p.unit}`,
          productId: p.id,
          productVariantId: null,
          unitPrice: p.pricePerUnit,
          displayName: p.name,
        });
      } else {
        productVariants.forEach((v) => {
          options.push({
            value: `variant-${v.id}`,
            label: `${p.name} — ${v.producer ?? ""} ${v.size} — ₦${v.pricePerUnit?.toLocaleString() ?? "-"}`,
            productId: p.id,
            productVariantId: v.id,
            unitPrice: v.pricePerUnit,
            displayName: `${p.name} (${v.producer ?? ""} ${v.size})`,
          });
        });
      }
    });
    return options;
  }, [products, variants]);

  // NEW: adds one line to the cart from the mini "add item" form below.
  // Per your decision, quantitySupplied defaults to the full
  // quantityOrdered (assume it all leaves today) UNLESS "Partial today" is
  // checked, in which case the worker enters the real supplied amount plus
  // an optional note (e.g. "rest completed at Branch 2").
  const handleAddCartItem = async () => {
    try {
      const values = await cartLineForm.validateFields();
      const option = sellableOptions.find((o) => o.value === values.sellableOption);
      if (!option) return;

      const quantitySupplied = values.partialSupply
        ? values.quantitySupplied
        : values.quantityOrdered;

      setCartItems((prev) => [
        ...prev,
        {
          key: `${option.value}-${Date.now()}`,
          productId: option.productId,
          productVariantId: option.productVariantId,
          displayName: option.displayName,
          unitPrice: option.unitPrice,
          quantityOrdered: values.quantityOrdered,
          quantitySupplied,
          supplyNote: values.partialSupply ? values.supplyNote || null : null,
        },
      ]);
      cartLineForm.resetFields();
    } catch (err) {
      // antd already shows inline validation errors on the mini form
    }
  };

  const handleRemoveCartItem = (key) => {
    setCartItems((prev) => prev.filter((item) => item.key !== key));
  };

  // Client-side estimate only, shown so the worker can see roughly what
  // they're about to submit and check Amount Paid against it. The
  // authoritative total is always recomputed server-side from real,
  // current prices in TransactionsService.addTransaction() — this number
  // is not sent to the backend at all.
  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantityOrdered,
    0,
  );

  // CHANGED: totalAmount is no longer read from the form — it's not a form
  // field anymore, it comes from the server's computation over `items`.
  // The old `alreadyConfirmed` checkbox is gone too (see chat: it never
  // actually worked, since addTransaction() always forced paymentStatus
  // back to "pending" regardless of what it sent).
  const handleCreateTransaction = async (values) => {
    if (cartItems.length === 0) {
      message.error("Add at least one item to the sale before saving.");
      return;
    }
    // NEW: mirrors the same cap check confirmPayment() already enforces
    // server-side — catches an obviously wrong entry before it's even sent.
    if (values.amountPaid > cartTotal) {
      message.error("Amount paid can't exceed the total sale amount.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/transactions", {
        customerName: values.customerName,
        customerPhone: values.customerPhone || null,
        amountPaid: values.amountPaid,
        retailerId: values.retailerId || null,
        items: cartItems.map((item) => ({
          productId: item.productId,
          productVariantId: item.productVariantId,
          quantityOrdered: item.quantityOrdered,
          quantitySupplied: item.quantitySupplied,
          supplyNote: item.supplyNote,
        })),
      });
      message.success("Transaction recorded!");
      form.resetFields();
      setCartItems([]);
      setIsModalOpen(false);
      fetchTransactions();
      fetchCatalog(); // NEW: stock levels just changed — refresh so the next sale's cart reflects it
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else if (error.response.status === 409) {
        // NEW: surfaces TransactionItemService's stock-sufficiency rejection
        // instead of a generic failure message.
        message.error(
          error.response.data?.message || "Not enough stock for one of the items.",
        );
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

  const dateFilteredTransactions = getFilteredTransactions(transactionRecord);
  const tableTransactions = getSearchedTransactions(dateFilteredTransactions);
  const stats = computeStats(dateFilteredTransactions);

  const searchByLabel = searchFieldKey
    ? SEARCH_FIELD_MAP[searchFieldKey].label
    : "Search By";

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
                    precision={2}
                    prefix="₦"
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
            <Dropdown
              menu={{
                items: menuItems,
                onClick: ({ key }) => setSearchFieldKey(Number(key)),
                selectedKeys: searchFieldKey ? [String(searchFieldKey)] : [],
              }}
              trigger={["click"]}
            >
              <Button style={{ width: 140 }}>
                {searchByLabel} <DownOutlined />
              </Button>
            </Dropdown>
            <Divider orientation="vertical" />
            <Search
              placeholder="Search transactions"
              style={{ width: 200 }}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
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
              dataSource={tableTransactions}
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
          setCartItems([]); // NEW: clear the cart along with the rest of the form
          cartLineForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateTransaction}>
          <Form.Item name="retailerId" label="Retailer (Optional)">
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Find Retailer"
              allowClear
              options={retailers.map((r) => ({ value: r.id, label: r.businessName }))}
            />
          </Form.Item>

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

          <Divider>Items</Divider>

          {/* NEW: cart line "mini form". component={false} stops antd from
              rendering an actual <form> element here — nesting a real <form>
              inside the outer <Form>'s own <form> tag is invalid HTML and
              can cause unpredictable Enter-key/submit behavior. This way it
              still gets full Form validation/state, just without the
              DOM-level nesting problem. */}
          <Form form={cartLineForm} layout="vertical" component={false}>
            <Row gutter={8}>
              <Col span={24} md={10}>
                <Form.Item
                  name="sellableOption"
                  rules={[{ required: true, message: "Pick an item" }]}
                  style={{ marginBottom: 8 }}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select product or variant"
                    options={sellableOptions}
                  />
                </Form.Item>
              </Col>
              <Col span={12} md={5}>
                <Form.Item
                  name="quantityOrdered"
                  rules={[{ required: true, message: "Qty" }]}
                  style={{ marginBottom: 8 }}
                >
                  <InputNumber min={1} placeholder="Qty" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={8} md={5}>
                <Form.Item name="partialSupply" valuePropName="checked" style={{ marginBottom: 8 }}>
                  <Checkbox>Partial today</Checkbox>
                </Form.Item>
              </Col>
              <Col span={4} md={4}>
                <Button type="dashed" block onClick={handleAddCartItem}>
                  Add
                </Button>
              </Col>
            </Row>

            {/* Only shown when "Partial today" is checked. Lets the worker
                record the real quantity leaving today plus why — e.g. the
                customer is completing the rest of the order at another
                branch, per your earlier "simple flagging" decision. This
                never triggers a per-branch stock check; it's informational
                only, and stock still only ever moves by quantitySupplied. */}
            <Form.Item
              noStyle
              shouldUpdate={(prev, cur) => prev.partialSupply !== cur.partialSupply}
            >
              {() =>
                cartLineForm.getFieldValue("partialSupply") ? (
                  <Row gutter={8}>
                    <Col span={10}>
                      <Form.Item
                        name="quantitySupplied"
                        rules={[{ required: true, message: "How many leave today?" }]}
                        style={{ marginBottom: 8 }}
                      >
                        <InputNumber min={0} placeholder="Qty supplied today" style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={14}>
                      <Form.Item name="supplyNote" style={{ marginBottom: 8 }}>
                        <Input placeholder="e.g. rest completed at Branch 2" />
                      </Form.Item>
                    </Col>
                  </Row>
                ) : null
              }
            </Form.Item>
          </Form>

          <Table
            size="small"
            dataSource={cartItems}
            rowKey="key"
            pagination={false}
            locale={{ emptyText: "No items added yet." }}
            style={{ marginBottom: 12 }}
            columns={[
              { title: "Item", dataIndex: "displayName", key: "displayName" },
              { title: "Ordered", dataIndex: "quantityOrdered", key: "quantityOrdered" },
              { title: "Supplied Today", dataIndex: "quantitySupplied", key: "quantitySupplied" },
              {
                title: "Line Total",
                key: "lineTotal",
                render: (_, item) => `₦${(item.unitPrice * item.quantityOrdered).toLocaleString()}`,
              },
              {
                title: "",
                key: "remove",
                render: (_, item) => (
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveCartItem(item.key)}
                  />
                ),
              },
            ]}
          />

          <div style={{ marginBottom: 16 }}>
            <Text strong>Estimated Total: ₦{cartTotal.toLocaleString()}</Text>
            <br />
            <Text type="secondary">
              (The server recalculates this from current prices when you save.)
            </Text>
          </div>

          {/* CHANGED: "Total Amount" field removed — it's server-computed
              now, not typed. Amount Paid stays, and now caps against the
              live cart estimate the same way the Update Payment modal caps
              against the real stored total. */}
          <Form.Item
            label="Amount Paid (₦)"
            name="amountPaid"
            rules={[{ required: true, message: "Amount paid is required" }]}
          >
            <InputNumber min={0} max={cartTotal} style={{ width: "100%" }} placeholder="e.g. 50000" />
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