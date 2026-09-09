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

  // NEW: discount feature. maxDiscount is the director-set global cap,
  // fetched from the backend — never hardcoded, since it's meant to be
  // changeable without a redeploy. discountCapModalOpen/-Form are for the
  // small director-only "edit the cap" control.
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
  // NEW: line items for whichever transaction Details is currently open on.
  const [detailsItems, setDetailsItems] = useState([]);
  const [detailsItemsLoading, setDetailsItemsLoading] = useState(false);

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
  // NEW: director-only — view/edit the global discount cap.
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

  // NEW: fetches the director-set discount cap. Non-fatal on failure —
  // falls back to 0 (no discount allowed), which is a safe default rather
  // than silently allowing an unbounded discount if this request fails.
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

  // NEW: live-watches the Discount field so the displayed total updates as
  // the worker types, without needing a manual onChange/state pairing.
  const discountWatch = Form.useWatch("discountAmount", form) || 0;
  const amountAfterDiscount = Math.max(cartTotal - discountWatch, 0);

  // CHANGED: totalAmount is no longer read from the form — it's not a form
  // field anymore, it comes from the server's computation over `items`.
  // The old `alreadyConfirmed` checkbox is gone too (see chat: it never
  // actually worked, since addTransaction() always forced paymentStatus
  // back to "pending" regardless of what it sent).
  //
  // CHANGED: this is now the entry point of a check-chain instead of doing
  // the submit directly. Two things get checked, in order, before anything
  // is sent: (1) is there a product picked in the "add item" row that never
  // got clicked into the cart, and (2) does amountPaid exceed the estimated
  // total. Both used to either silently do nothing (the unadded-line case)
  // or hard-block with message.error (the over-cap case) — now both ask
  // the worker to confirm instead, matching what was actually requested.
  const handleCreateTransaction = (values) => {
    if (cartItems.length === 0) {
      message.error("Add at least one item to the sale before saving.");
      return;
    }

    const discountAmount = values.discountAmount || 0;

    // NEW: client-side mirror of the backend's own cap check — catches an
    // obviously-over-cap entry before it round-trips to the server. This is
    // a genuine block, not a confirm, because unlike the amountPaid check
    // below, there's no legitimate reason a discount should ever exceed a
    // director-set policy value — it's not a judgment call, it's a rule.
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

    // CHANGED: the amount-owed figure this checks against now accounts for
    // the discount — otherwise a legitimately fully-paid discounted sale
    // would incorrectly trigger the "are you sure" prompt below.
    const amountOwed = cartTotal - discountAmount;

    const pendingLineOption = cartLineForm.getFieldValue("sellableOption");

    const checkAmountThenSubmit = () => {
      if (values.amountPaid > amountOwed) {
        // NEW: soft confirm, not a hard block. There's no backend-side cap
        // on amountPaid at creation time (unlike confirmPayment, which DOES
        // hard-reject overpayment — see the Update Payment handler below,
        // which is deliberately NOT given this same "are you sure" escape
        // hatch, because saying yes there would just guarantee a 400 from
        // the backend). At creation, paying more than the computed total
        // has plausible real reasons (e.g. a round-number cash deposit), so
        // this is a genuine "confirm, don't block."
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
      // NEW: this is the exact gap flagged when the cart was first built —
      // a product picked in the mini "add item" form that never got its own
      // "Add" click. Previously it just silently vanished on submit.
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
        discountAmount, // NEW
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

  // CHANGED: the `max` clamp on this form's InputNumber is gone too (see
  // below), so this now needs its own explicit check. Unlike the create
  // form above, this is NOT a "confirm to override" — confirmPayment()
  // hard-rejects overpayment server-side with a 400 (that guard is real
  // business logic: you can't pay more than what a specific, already-fixed
  // invoice says is owed). Offering a "yes I'm sure, proceed" button here
  // would just guarantee a rejected request one step later — so this stays
  // a plain, clear message instead, not a confirm dialog.
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

  // CHANGED: now async — fetches this transaction's items from
  // /transaction_item/transaction/{id} (an endpoint that already existed,
  // just wasn't being used by the frontend) so Details can actually show
  // what was bought, not just the header-level totals.
  const openDetails = async (record) => {
    setDetailsTxn(record);
    setIsDetailsOpen(true);
    setDetailsItemsLoading(true);
    try {
      const res = await api.get(`/transaction_item/transaction/${record.id}`);
      setDetailsItems(res.data);
    } catch (error) {
      message.error("Couldn't load the items for this transaction.");
      setDetailsItems([]);
    } finally {
      setDetailsItemsLoading(false);
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
            <Space>
              {/* NEW: director-only view/edit of the global discount cap. */}
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
          setCartItems([]); // clear the cart along with the rest of the form
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
            <Text>Subtotal: ₦{cartTotal.toLocaleString()}</Text>
            <br />
            <Text strong>Estimated Total: ₦{amountAfterDiscount.toLocaleString()}</Text>
            <br />
            <Text type="secondary">
              (The server recalculates this from current prices and re-checks the discount cap when you save.)
            </Text>
          </div>

          {/* NEW: discount field. Capped visually to whichever is smaller —
              the director-set global cap, or the sale's own subtotal (can't
              discount more than the sale is worth). The real enforcement
              against the cap happens server-side in addTransaction(); this
              is just to stop an obviously-wrong entry before it's typed. */}
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

          {/* CHANGED: "Total Amount" field removed — it's server-computed
              now, not typed. Amount Paid's `max` clamp is gone too — it used
              to silently snap the typed value down to cartTotal on blur with
              no explanation. Over-cap entries are now caught in
              handleCreateTransaction's confirm chain instead, which tells
              the worker by how much and asks them to confirm. */}
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

      {/* NEW: director-only — view/edit the global discount cap. */}
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

        {/* NEW: what was actually bought. Falls back gracefully on a
            transaction recorded before items existed at all (an empty
            list, not an error) — the emptyText makes that distinction
            clear instead of it looking like a loading failure. */}
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
                <Tag
                  color={
                    status === "supplied"
                      ? "green"
                      : status === "partially_supplied"
                        ? "gold"
                        : "red"
                  }
                >
                  {(status ?? "").replace("_", " ").toUpperCase()}
                </Tag>
              ),
            },
            {
              title: "Note",
              dataIndex: "supplyNote",
              key: "supplyNote",
              render: (note) => note || "—",
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default TransactionsPage;