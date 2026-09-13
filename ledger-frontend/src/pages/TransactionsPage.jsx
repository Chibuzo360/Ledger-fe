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

// NEW: worst-case ranking used to derive ONE overall status for a
// multi-item transaction. A transaction with 3 items where even one is
// still owed is NOT "supplied" — it's "partially_supplied" — same logic
// agreed on for the status filter.
const STATUS_RANK = { supplied: 0, partially_supplied: 1, not_supplied: 2 };

const SUPPLY_STATUS_COLOR = {
  supplied: "green",
  partially_supplied: "gold",
  not_supplied: "red",
};

const SUPPLY_STATUS_LABEL = {
  supplied: "SUPPLIED",
  partially_supplied: "PARTIALLY SUPPLIED",
  not_supplied: "NOT SUPPLIED",
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

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);

  // NEW: every TransactionItem across every transaction, fetched once via
  // the existing (already-built) GET /api/transaction_item endpoint.
  // Grouped client-side into a per-transaction overall status below —
  // avoids an N+1 backend query per transaction row just to know whether
  // each one is fully supplied.
  const [allTransactionItems, setAllTransactionItems] = useState([]);

  const [cartItems, setCartItems] = useState([]);
  const [cartLineForm] = Form.useForm();

  const [maxDiscount, setMaxDiscount] = useState(0);
  const [discountCapModalOpen, setDiscountCapModalOpen] = useState(false);
  const [discountCapForm] = Form.useForm();
  const [discountCapSubmitting, setDiscountCapSubmitting] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentForm] = Form.useForm();

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [detailsTxn, setDetailsTxn] = useState(null);
  const [detailsItems, setDetailsItems] = useState([]);
  const [detailsItemsLoading, setDetailsItemsLoading] = useState(false);

  // NEW: "Supply remaining" modal — opened from a row inside Details.
  const [supplyModalOpen, setSupplyModalOpen] = useState(false);
  const [supplyTargetItem, setSupplyTargetItem] = useState(null);
  const [supplySubmitting, setSupplySubmitting] = useState(false);
  const [supplyForm] = Form.useForm();

  // CHANGED: default filter mode/date now show TODAY on first load instead
  // of an empty/all-time view — per your "one-day default everywhere"
  // decision. filterMode stays "single" by default; singleDate starts on
  // today's date rather than null.
  const [filterMode, setFilterMode] = useState("single");
  const [singleDate, setSingleDate] = useState(dayjs());
  const [dateRange, setDateRange] = useState(null);

  // NEW: status filter — null means "no filter, show all statuses".
  const [statusFilter, setStatusFilter] = useState(null);

  const [searchFieldKey, setSearchFieldKey] = useState(null);
  const [searchText, setSearchText] = useState("");

  // NEW: groups allTransactionItems by transaction id, then reduces each
  // group down to ONE overall status using the worst-case rule above.
  // Transactions with no items at all (pre-cart-feature legacy rows, or a
  // fetch race) fall back to "not_supplied" rather than crashing or being
  // silently excluded from the filter.
  const overallStatusByTxnId = useMemo(() => {
    const grouped = {};
    allTransactionItems.forEach((item) => {
      const txnId = item.transaction?.id;
      if (!txnId) return;
      if (!grouped[txnId]) grouped[txnId] = [];
      grouped[txnId].push(item.supplyStatus);
    });

    const result = {};
    Object.entries(grouped).forEach(([txnId, statuses]) => {
      const worst = statuses.reduce((worstSoFar, status) =>
        (STATUS_RANK[status] ?? 2) > (STATUS_RANK[worstSoFar] ?? 2) ? status : worstSoFar,
      "supplied");
      result[txnId] = worst;
    });
    return result;
  }, [allTransactionItems]);

  // NEW: transactionRecord rows enriched with their derived overall supply
  // status — a separate memo rather than baking this into fetchTransactions
  // itself, since it depends on TWO independently-fetched datasets.
  const transactionsWithStatus = useMemo(() => {
    return transactionRecord.map((t) => ({
      ...t,
      supplyStatus: overallStatusByTxnId[t.id] ?? "not_supplied",
    }));
  }, [transactionRecord, overallStatusByTxnId]);

  const getFilteredTransactions = (transactions) => {
    let result = transactions;

    if (filterMode === "single" && singleDate) {
      result = result.filter((t) => dayjs(t.date).isSame(singleDate, "day"));
    } else if (filterMode === "range" && dateRange) {
      result = result.filter((t) =>
        dayjs(t.date).isBetween(dateRange[0], dateRange[1], "day", "[]"),
      );
    }

    // NEW: status filter, applied alongside the date filter.
    if (statusFilter) {
      result = result.filter((t) => t.supplyStatus === statusFilter);
    }

    return result;
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

  // NEW: fetches every transaction item, used only to derive each
  // transaction's overall supply status for the table/filter. Deliberately
  // non-fatal on failure — the page still works without it, just without
  // the status column/filter being meaningful (defaults to not_supplied).
  const fetchAllTransactionItems = async () => {
    try {
      const res = await api.get("/transaction_item");
      setAllTransactionItems(res.data);
    } catch (error) {
      setAllTransactionItems([]);
    }
  };

  const openDiscountCapModal = () => {
    discountCapForm.setFieldsValue({ maxDiscountAmount: maxDiscount });
    setDiscountCapModalOpen(true);
  };

  const handleUpdateDiscountCap = async (values) => {
    setDiscountCapSubmitting(true);
    try {
      const res = await api.put("/discount-settings", {
        maxDiscountAmount: values.maxDiscountAmount,
      });
      setMaxDiscount(res.data.maxDiscountAmount);
      message.success("Discount cap updated.");
      setDiscountCapModalOpen(false);
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else if (error.response.status === 403) {
        message.error("Only a director can change the discount cap.");
      } else {
        message.error("Failed to update discount cap.");
      }
    } finally {
      setDiscountCapSubmitting(false);
    }
  };

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

  const fetchDiscountCap = async () => {
    try {
      const res = await api.get("/discount-settings");
      setMaxDiscount(res.data.maxDiscountAmount ?? 0);
    } catch (error) {
      setMaxDiscount(0);
    }
  };

  useEffect(() => {
    fetchTransactions();
    fetchRetailers();
    fetchCatalog();
    fetchDiscountCap();
    fetchAllTransactionItems(); // NEW
  }, []);

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

  const cartTotal = cartItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantityOrdered,
    0,
  );

  const discountWatch = Form.useWatch("discountAmount", form) || 0;
  const amountAfterDiscount = Math.max(cartTotal - discountWatch, 0);

  const handleCreateTransaction = (values) => {
    if (cartItems.length === 0) {
      message.error("Add at least one item to the sale before saving.");
      return;
    }

    const discountAmount = values.discountAmount || 0;

    if (discountAmount > maxDiscount) {
      message.error(
        `Discount can't exceed the approved cap of ₦${maxDiscount.toLocaleString()}.`,
      );
      return;
    }
    if (discountAmount > cartTotal) {
      message.error("Discount can't exceed the sale's total.");
      return;
    }

    const amountOwed = cartTotal - discountAmount;

    const pendingLineOption = cartLineForm.getFieldValue("sellableOption");

    const checkAmountThenSubmit = () => {
      if (values.amountPaid > amountOwed) {
        Modal.confirm({
          title: "Amount paid is more than the total",
          content: `You entered ₦${values.amountPaid.toLocaleString()}, but the total after discount is ₦${amountOwed.toLocaleString()}. Are you sure this is correct?`,
          okText: "Yes, it's correct",
          cancelText: "Let me fix it",
          onOk: () => submitTransaction(values, discountAmount),
        });
      } else {
        submitTransaction(values, discountAmount);
      }
    };

    if (pendingLineOption) {
      Modal.confirm({
        title: "There's an item you haven't added yet",
        content:
          'A product is selected in the "Add Item" row below, but it was never added to the cart with the Add button. It will NOT be included in this sale unless you go back and add it.',
        okText: "Continue Without It",
        cancelText: "Go Back",
        onOk: checkAmountThenSubmit,
      });
    } else {
      checkAmountThenSubmit();
    }
  };

  const submitTransaction = async (values, discountAmount) => {
    setSubmitting(true);
    try {
      await api.post("/transactions", {
        customerName: values.customerName,
        customerPhone: values.customerPhone || null,
        amountPaid: values.amountPaid,
        discountAmount,
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
      fetchAllTransactionItems(); // NEW: new items exist now, refresh status map
      fetchCatalog();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else if (error.response.status === 409) {
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
    if (values.amountPaid > selectedTxn.amount) {
      message.error(
        `Amount paid can't exceed the total owed (₦${selectedTxn.amount.toLocaleString()}).`,
      );
      return;
    }
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
      fetchAllTransactionItems(); // NEW: that transaction's items are gone too
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

  // CHANGED: extracted into its own function so both openDetails() and the
  // post-"Supply remaining" refresh can reuse the exact same fetch logic
  // instead of duplicating it.
  const loadDetailsItems = async (transactionId) => {
    setDetailsItemsLoading(true);
    try {
      const res = await api.get(`/transaction_item/transaction/${transactionId}`);
      setDetailsItems(res.data);
    } catch (error) {
      message.error("Couldn't load the items for this transaction.");
      setDetailsItems([]);
    } finally {
      setDetailsItemsLoading(false);
    }
  };

  const openDetails = async (record) => {
    setDetailsTxn(record);
    setIsDetailsOpen(true);
    await loadDetailsItems(record.id);
  };

  // NEW: opens the small "how many more today" form for one line item.
  const openSupplyModal = (item) => {
    setSupplyTargetItem(item);
    supplyForm.resetFields();
    setSupplyModalOpen(true);
  };

  // NEW: submits the supply-remaining request, then refreshes everything
  // that could now be stale — this item's row in Details, the page-level
  // status map (so the filter/column stay correct), and the catalog (since
  // stock just moved).
  const handleSupplyRemaining = async (values) => {
    setSupplySubmitting(true);
    try {
      await api.put(`/transaction_item/${supplyTargetItem.id}/supply`, {
        additionalQuantity: values.additionalQuantity,
        note: values.note || null,
      });
      message.success("Delivery updated.");
      setSupplyModalOpen(false);
      supplyForm.resetFields();
      if (detailsTxn) await loadDetailsItems(detailsTxn.id);
      fetchAllTransactionItems();
      fetchCatalog();
    } catch (error) {
      if (!error.response) {
        message.error("Can't reach the server.");
      } else if (error.response.status === 409) {
        message.error(error.response.data?.message || "Not enough stock for this item.");
      } else if (error.response.status === 400) {
        message.error(error.response.data?.message || "Invalid quantity.");
      } else {
        message.error("Failed to update delivery.");
      }
    } finally {
      setSupplySubmitting(false);
    }
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
    // NEW: delivery/supply status column — separate from payment status
    // above. A sale can be fully PAID but only PARTIALLY SUPPLIED, or vice
    // versa; conflating the two would hide real, actionable information.
    {
      title: "Supply",
      dataIndex: "supplyStatus",
      key: "supplyStatus",
      render: (status) => (
        <Tag color={SUPPLY_STATUS_COLOR[status] ?? "default"}>
          {SUPPLY_STATUS_LABEL[status] ?? "—"}
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

  const dateFilteredTransactions = getFilteredTransactions(transactionsWithStatus);
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
            <Space>
              {isDirector && (
                <Button onClick={openDiscountCapModal}>
                  Discount Cap: ₦{maxDiscount.toLocaleString()}
                </Button>
              )}
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setIsModalOpen(true)}
              >
                Record New Sale
              </Button>
            </Space>
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
          <Divider orientation="vertical" />

          {/* NEW: status filter dropdown. */}
          <Select
            allowClear
            placeholder="Filter by supply status"
            style={{ width: 200 }}
            value={statusFilter}
            onChange={(val) => setStatusFilter(val ?? null)}
            options={[
              { value: "not_supplied", label: "Not Supplied" },
              { value: "partially_supplied", label: "Partially Supplied" },
              { value: "supplied", label: "Supplied" },
            ]}
          />

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
          setCartItems([]);
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
            <Text>Subtotal: ₦{cartTotal.toLocaleString()}</Text>
            <br />
            <Text strong>Estimated Total: ₦{amountAfterDiscount.toLocaleString()}</Text>
            <br />
            <Text type="secondary">
              (The server recalculates this from current prices and re-checks the discount cap when you save.)
            </Text>
          </div>

          <Form.Item
            label={`Discount (₦) — up to ₦${Math.min(maxDiscount, cartTotal).toLocaleString()}`}
            name="discountAmount"
            initialValue={0}
          >
            <InputNumber
              min={0}
              max={Math.min(maxDiscount, cartTotal)}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item
            label="Amount Paid (₦)"
            name="amountPaid"
            rules={[{ required: true, message: "Amount paid is required" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} placeholder="e.g. 50000" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block>
              Save Transaction
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Discount Cap"
        open={discountCapModalOpen}
        onCancel={() => setDiscountCapModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={discountCapForm} layout="vertical" onFinish={handleUpdateDiscountCap}>
          <Form.Item
            label="Maximum discount workers can apply without your approval (₦)"
            name="maxDiscountAmount"
            rules={[{ required: true, message: "A cap amount is required" }]}
          >
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={discountCapSubmitting} block>
              Save Cap
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

        <Divider>Items Purchased</Divider>
        <Table
          size="small"
          loading={detailsItemsLoading}
          dataSource={detailsItems}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: "No items recorded for this transaction." }}
          columns={[
            {
              title: "Item",
              key: "item",
              render: (_, item) =>
                item.productVariant
                  ? `${item.product?.name ?? ""} (${item.productVariant.producer ?? ""} ${item.productVariant.size ?? ""})`
                  : item.product?.name ?? "—",
            },
            { title: "Ordered", dataIndex: "quantityOrdered", key: "quantityOrdered" },
            { title: "Supplied", dataIndex: "quantitySupplied", key: "quantitySupplied" },
            {
              title: "Status",
              dataIndex: "supplyStatus",
              key: "supplyStatus",
              render: (status) => (
                <Tag color={SUPPLY_STATUS_COLOR[status] ?? "default"}>
                  {SUPPLY_STATUS_LABEL[status] ?? (status ?? "").replace("_", " ").toUpperCase()}
                </Tag>
              ),
            },
            {
              title: "Note",
              dataIndex: "supplyNote",
              key: "supplyNote",
              render: (note) => note || "—",
            },
            // NEW: "Supply remaining" action — only shown when this item
            // still owes units. Nothing to do once a line is fully supplied.
            {
              title: "",
              key: "supplyAction",
              render: (_, item) =>
                item.supplyStatus !== "supplied" ? (
                  <Button size="small" onClick={() => openSupplyModal(item)}>
                    Supply remaining
                  </Button>
                ) : null,
            },
          ]}
        />
      </Modal>

      {/* NEW: "Supply remaining" modal — records that more units of a
          previously partial delivery have now gone out. */}
      <Modal
        title={
          supplyTargetItem
            ? `Supply remaining — ${
                supplyTargetItem.productVariant
                  ? `${supplyTargetItem.product?.name ?? ""} (${supplyTargetItem.productVariant.producer ?? ""} ${supplyTargetItem.productVariant.size ?? ""})`
                  : supplyTargetItem.product?.name ?? ""
              }`
            : "Supply remaining"
        }
        open={supplyModalOpen}
        onCancel={() => setSupplyModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        {supplyTargetItem && (
          <Text type="secondary">
            {supplyTargetItem.quantitySupplied} of {supplyTargetItem.quantityOrdered} supplied so far —{" "}
            {supplyTargetItem.quantityOrdered - supplyTargetItem.quantitySupplied} still owed.
          </Text>
        )}
        <Form
          form={supplyForm}
          layout="vertical"
          onFinish={handleSupplyRemaining}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            label="How many more are leaving today?"
            name="additionalQuantity"
            rules={[{ required: true, message: "Quantity is required" }]}
          >
            <InputNumber
              min={1}
              max={
                supplyTargetItem
                  ? supplyTargetItem.quantityOrdered - supplyTargetItem.quantitySupplied
                  : undefined
              }
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item label="Note (optional)" name="note">
            <Input placeholder="e.g. remainder arrived from supplier today" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={supplySubmitting} block>
              Confirm Delivery
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TransactionsPage;