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
  DatePicker,
  Segmented,
  Spin,
  Empty,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { Pie, Column } from "@ant-design/charts";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFilterState } from "../context/FilterContext";
import api from "../api/axiosConfig";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
dayjs.extend(isBetween);

const { Title, Text } = Typography;

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDirector = user?.role === "director";

  const [transactions, setTransactions] = useState([]);
  const [transactionItems, setTransactionItems] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Same shared, per-page-persisted date filter used on Transactions and
  // Expenses -- keyed "dashboard" so it's fully independent of both.
  // Defaults to today, same as every other money page.
  const [dateFilter, setDateFilter] = useFilterState("dashboard", {
    filterMode: "single",
    singleDate: dayjs(),
    dateRange: null,
  });
  const { filterMode, singleDate, dateRange } = dateFilter;

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [txnRes, itemsRes, expRes, prodRes, varRes] = await Promise.all([
        api.get("/transactions"),
        api.get("/transaction_item"),
        api.get("/expenses"),
        api.get("/products"),
        api.get("/product-variants"),
      ]);
      setTransactions(txnRes.data);
      setTransactionItems(itemsRes.data);
      setExpenses(expRes.data);
      setProducts(prodRes.data);
      setVariants(varRes.data);
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

  // ---------------------------------------------------------------------
  // Date-filter helpers -- same shape as TransactionsPage/ExpensesPage,
  // applied to whichever array is passed in (transactions or expenses).
  // ---------------------------------------------------------------------
  const withinDateFilter = (isoDate) => {
    if (filterMode === "single" && singleDate) {
      return dayjs(isoDate).isSame(singleDate, "day");
    }
    if (filterMode === "range" && dateRange) {
      return dayjs(isoDate).isBetween(dateRange[0], dateRange[1], "day", "[]");
    }
    return true;
  };

  const getPeriodLabel = () => {
    if (filterMode === "range" && dateRange) {
      return `${dateRange[0].format("DD MMM")} – ${dateRange[1].format("DD MMM")}`;
    }
    if (filterMode === "single" && singleDate) {
      return singleDate.format("DD MMM YYYY");
    }
    return "All Time";
  };

  const filteredTransactions = useMemo(
    () => transactions.filter((t) => withinDateFilter(t.createdAt)),
    [transactions, filterMode, singleDate, dateRange],
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((e) => withinDateFilter(e.createdAt)),
    [expenses, filterMode, singleDate, dateRange],
  );

  // ---------------------------------------------------------------------
  // Stat cards
  // ---------------------------------------------------------------------
  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Deliberately NOT date-filtered -- these represent an ongoing backlog
  // (money still owed, payments still waiting on a director), not a
  // snapshot of one period. A credit from three weeks ago doesn't stop
  // being owed just because today's date is selected.
  const pendingApprovalsCount = useMemo(
    () => transactions.filter((t) => t.paymentStatus === "pending").length,
    [transactions],
  );

  const outstandingCredits = useMemo(
    () =>
      transactions.reduce((sum, t) => {
        const owed = t.totalAmount - t.amountPaid;
        return owed > 0 ? sum + owed : sum;
      }, 0),
    [transactions],
  );

  // ---------------------------------------------------------------------
  // Recent Transactions table -- real data, respects the date filter,
  // newest first (backend already returns them pre-sorted), capped at 8
  // rows so the dashboard stays a snapshot, not a second Transactions page.
  // ---------------------------------------------------------------------
  const recentTransactions = useMemo(
    () =>
      filteredTransactions.slice(0, 8).map((t) => ({
        key: t.id,
        id: t.id,
        customer: t.customerName,
        amount: t.totalAmount,
        status: t.paymentStatus,
        type: t.paymentType,
        date: t.createdAt,
      })),
    [filteredTransactions],
  );

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
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      render: (d) => dayjs(d).format("DD MMM YYYY, HH:mm"),
    },
  ];

  // ---------------------------------------------------------------------
  // Sales by Product Category (pie) -- real data. TransactionItem
  // responses don't carry their own date, so each item's date is looked
  // up via its parent transaction's id against the already-fetched
  // transactions list, then the SAME date filter above is applied here
  // too -- one consistent "period" concept across the whole page.
  // ---------------------------------------------------------------------
  const salesByProduct = useMemo(() => {
    const txnDateById = new Map(transactions.map((t) => [t.id, t.createdAt]));

    const grouped = {};
    transactionItems.forEach((item) => {
      const txnDate = txnDateById.get(item.transaction?.id);
      if (!txnDate || !withinDateFilter(txnDate)) return;

      const categoryName = item.product?.category?.name ?? "Uncategorized";
      const unitPrice = item.productVariant?.pricePerUnit ?? item.product?.pricePerUnit ?? 0;
      const lineValue = unitPrice * item.quantityOrdered;

      grouped[categoryName] = (grouped[categoryName] ?? 0) + lineValue;
    });

    return Object.entries(grouped).map(([type, value]) => ({ type, value }));
  }, [transactionItems, transactions, filterMode, singleDate, dateRange]);

  // ---------------------------------------------------------------------
  // Weekly Sales (bar) -- deliberately fixed to the trailing 7 REAL days
  // ending today, independent of the date filter above. This is a trend
  // chart ("how has this week gone"), not a period snapshot -- tying it
  // to a single selected day would make it show almost nothing most of
  // the time.
  // ---------------------------------------------------------------------
  const weeklySales = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => dayjs().subtract(6 - i, "day"));
    return days.map((day) => {
      const total = transactions
        .filter((t) => dayjs(t.createdAt).isSame(day, "day"))
        .reduce((sum, t) => sum + t.totalAmount, 0);
      return { day: day.format("ddd D"), sales: total };
    });
  }, [transactions]);

  // ---------------------------------------------------------------------
  // Stock by Category (bar) -- CHANGED from the original mock's grouped
  // per-producer breakdown to one bar per category (total current stock
  // summed across every product and variant in it). A real catalog could
  // have many producer/size combinations per category, which would make
  // a grouped chart cluttered and hard to read -- this stays legible
  // regardless of how large the catalog grows, and still answers the
  // question that matters most at a glance: "which category is running
  // low."
  // ---------------------------------------------------------------------
  const stockByCategory = useMemo(() => {
    const grouped = {};

    products.forEach((p) => {
      const hasVariants = variants.some((v) => v.product?.id === p.id);
      if (hasVariants) return; // counted via its variants below instead
      const categoryName = p.category?.name ?? "Uncategorized";
      grouped[categoryName] = (grouped[categoryName] ?? 0) + (p.currentStock ?? 0);
    });

    variants.forEach((v) => {
      const categoryName = v.product?.category?.name ?? "Uncategorized";
      grouped[categoryName] = (grouped[categoryName] ?? 0) + (v.currentStock ?? 0);
    });

    return Object.entries(grouped).map(([category, stock]) => ({ category, stock }));
  }, [products, variants]);

  // ---------------------------------------------------------------------
  // Chart configs
  // ---------------------------------------------------------------------
  // CHANGED: innerRadius turns this into a donut (matches the referenced
  // look), and the outer slice labels are dropped in favor of relying
  // fully on the right-side legend list for name/percentage -- a donut
  // with both outer labels AND a legend tends to look cluttered, so this
  // picks one clear place to read the breakdown rather than two
  // competing ones.
  const pieConfig = {
    data: salesByProduct,
    angleField: "value",
    colorField: "type",
    radius: 0.85,
    innerRadius: 0.6,
    legend: {
      color: {
        position: "right",
        layout: { justifyContent: "center", flexDirection: "column" },
        itemName: { style: { fontSize: 12 } },
      },
    },
    label: false,
    interactions: [{ type: "element-active" }],
  };

  const weeklyBarConfig = {
    data: weeklySales,
    xField: "day",
    yField: "sales",
    color: "#1890ff",
    xAxis: { label: { autoHide: true } },
    yAxis: { label: { formatter: (v) => `₦${(v / 1000).toFixed(0)}k` } },
  };

  const stockBarConfig = {
    data: stockByCategory,
    xField: "category",
    yField: "stock",
    color: "#52c41a",
    xAxis: { label: { autoHide: true } },
  };

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Welcome back, {user?.name || "User"} 👋
            </Title>
            <Text type="secondary">
              Here is an overview of CAV Ledger — {getPeriodLabel()}.
            </Text>
          </Col>
          <Col>
            <Space wrap>
              <Segmented
                options={["Single", "Range"]}
                value={filterMode === "single" ? "Single" : "Range"}
                onChange={(val) =>
                  setDateFilter({ filterMode: val === "Single" ? "single" : "range" })
                }
              />
              {filterMode === "single" ? (
                <DatePicker
                  value={singleDate}
                  onChange={(date) => setDateFilter({ singleDate: date })}
                  allowClear
                />
              ) : (
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={(dates) => setDateFilter({ dateRange: dates })}
                  allowClear
                />
              )}
              {/* CHANGED: this button did nothing before. Building a
                  cross-page trigger for TransactionsPage's own "Record
                  New Sale" modal is real added complexity for one button
                  -- navigating there directly is the honest, low-risk
                  version; the modal is one more click away. */}
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/transactions")}>
                Record New Sale
              </Button>
            </Space>
          </Col>
        </Row>

        {errorMsg && <Text type="danger">{errorMsg}</Text>}

        <Spin spinning={loading}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card variant="plain">
                <Statistic title="Transactions" value={filteredTransactions.length} />
              </Card>
            </Col>

            {isDirector && (
              <>
                <Col xs={24} sm={12} lg={6}>
                  <Card variant="plain">
                    <Statistic
                      title="Total Revenue"
                      value={totalRevenue}
                      prefix="₦"
                      styles={{ content: { color: "#3f8600" } }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Card variant="plain">
                    <Statistic
                      title="Total Expenses"
                      value={totalExpenses}
                      prefix="₦"
                      styles={{ content: { color: "#cf1322" } }}
                    />
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Card variant="plain">
                    <Statistic
                      title="Outstanding Credits"
                      value={outstandingCredits}
                      prefix="₦"
                      styles={{ content: { color: "#d46b08" } }}
                    />
                    {/* NEW: this stat is deliberately not date-filtered --
                        labeled so it's not confusing when it doesn't move
                        with the date picker above. */}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Current total — not date-filtered
                    </Text>
                  </Card>
                </Col>
              </>
            )}
          </Row>

          {isDirector && pendingApprovalsCount > 0 && (
            <Row style={{ marginTop: 16 }}>
              <Col span={24}>
                <Card variant="plain">
                  <Statistic
                    title="Pending Confirmation"
                    value={pendingApprovalsCount}
                    suffix={pendingApprovalsCount === 1 ? "transaction" : "transactions"}
                    styles={{ content: { color: "#d46b08" } }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Current total — not date-filtered
                  </Text>
                </Card>
              </Col>
            </Row>
          )}

          {isDirector && (
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} lg={10}>
                <Card title={`Sales by Category — ${getPeriodLabel()}`} variant="plain">
                  {salesByProduct.length > 0 ? (
                    <Pie {...pieConfig} height={260} />
                  ) : (
                    <Empty description="No sales in this period yet." />
                  )}
                </Card>
              </Col>
              <Col xs={24} lg={14}>
                <Card title="Weekly Sales — Last 7 Days (₦)" variant="plain">
                  <Column {...weeklyBarConfig} height={260} />
                </Card>
              </Col>
              <Col xs={24}>
                <Card title="Current Stock by Category" variant="plain">
                  {stockByCategory.length > 0 ? (
                    <Column {...stockBarConfig} height={220} />
                  ) : (
                    <Empty description="No products recorded yet." />
                  )}
                </Card>
              </Col>
            </Row>
          )}

          <Row style={{ marginTop: 16 }}>
            <Col span={24}>
              <Card title={`Recent Transactions — ${getPeriodLabel()}`} variant="plain">
                <Table
                  dataSource={recentTransactions}
                  columns={columns}
                  pagination={false}
                  scroll={{ x: true }}
                  locale={{ emptyText: "No transactions in this period." }}
                />
              </Card>
            </Col>
          </Row>
        </Spin>
      </Space>
    </div>
  );
};

export default DashboardPage;