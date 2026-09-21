import React, { useState, useEffect, useMemo } from "react";
import {
  Row,
  Col,
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  message,
  Space,
  Typography,
  Popconfirm,
  Tooltip,
  Empty,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";

const { Title, Text } = Typography;

const CREATE_NEW_VALUE = "__create_new__";
const UNCATEGORIZED_ID = "__uncategorized__";

// Submit-time capitalizer -- still used to normalize search text when
// creating a category inline from the product form's Select.
const capitalizeWords = (str) =>
  str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

// NEW: live-as-you-type capitalizer for the Add/Rename Category modal's
// Input. Deliberately does NOT trim or collapse whitespace like
// capitalizeWords above -- doing that live would strip the trailing space
// the instant you finish a word, making it impossible to type a second
// word. Instead it walks the string in whitespace/non-whitespace chunks,
// capitalizing the first letter of each word-chunk and lowercasing the
// rest, while preserving every space exactly as typed.
const liveCapitalize = (str) => {
  if (!str) return str;
  return str
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join("");
};

export default function ProductPage() {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [addTargetCategory, setAddTargetCategory] = useState(null);
  const [productForm] = Form.useForm();
  const [categorySearch, setCategorySearch] = useState("");

  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm] = Form.useForm();

  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [variantParentProduct, setVariantParentProduct] = useState(null);
  const [variantForm] = Form.useForm();

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockForm] = Form.useForm();

  const [stockHistory, setStockHistory] = useState([]);
  const [stockHistoryLoading, setStockHistoryLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [productsRes, variantsRes, categoriesRes] = await Promise.all([
        api.get("/products"),
        api.get("/product-variants"),
        api.get("/categories"),
      ]);
      setProducts(productsRes.data);
      setVariants(variantsRes.data);
      setCategories(categoriesRes.data);
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

  const categoryRows = useMemo(() => {
    const byId = new Map();
    categories.forEach((cat) => {
      byId.set(cat.id, { ...cat, products: [] });
    });

    const uncategorizedProducts = [];

    products.forEach((product) => {
      const productVariants = variants.filter(
        (v) => v.product && v.product.id === product.id
      );
      const row = { ...product, variants: productVariants };

      if (product.category && byId.has(product.category.id)) {
        byId.get(product.category.id).products.push(row);
      } else {
        uncategorizedProducts.push(row);
      }
    });

    const rows = Array.from(byId.values());
    if (uncategorizedProducts.length > 0) {
      rows.push({
        id: UNCATEGORIZED_ID,
        name: "Uncategorized",
        products: uncategorizedProducts,
        isUncategorized: true,
      });
    }
    return rows;
  }, [categories, products, variants]);

  const categoryOptions = useMemo(() => {
    const search = categorySearch.trim();
    const filtered = search
      ? categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
      : categories;
    const base = filtered.map((c) => ({ label: c.name, value: c.id }));
    const alreadyExists = categories.some(
      (c) => c.name.toLowerCase() === search.toLowerCase()
    );
    if (search && !alreadyExists) {
      base.push({ label: `+ Create "${search}"`, value: CREATE_NEW_VALUE });
    }
    return base;
  }, [categories, categorySearch]);

  const handleCategorySelectChange = async (value) => {
    if (value === CREATE_NEW_VALUE) {
      const name = capitalizeWords(categorySearch);
      if (!name) {
        setCategorySearch("");
        return;
      }
      try {
        const created = await api.post("/categories", { name });
        setCategories((prev) => [...prev, created.data]);
        productForm.setFieldsValue({ categoryId: created.data.id });
        message.success(`Category "${created.data.name}" created.`);
      } catch (err) {
        message.error("Failed to create category.");
        productForm.setFieldsValue({ categoryId: undefined });
      }
    }
    setCategorySearch("");
  };

  const openAddProduct = (categoryRow) => {
    setEditingProduct(null);
    setAddTargetCategory(categoryRow);
    productForm.resetFields();
    setCategorySearch("");
    setProductModalOpen(true);
  };

  const openEditProduct = (record) => {
    setEditingProduct(record);
    setAddTargetCategory(null);
    productForm.setFieldsValue({
      name: record.name,
      unit: record.unit,
      pricePerUnit: record.pricePerUnit,
      currentStock: record.currentStock,
      categoryId: record.category ? record.category.id : undefined,
    });
    setCategorySearch("");
    setProductModalOpen(true);
  };

  const handleProductSubmit = async () => {
    try {
      const values = await productForm.validateFields();
      const categoryId = editingProduct ? values.categoryId : addTargetCategory?.id;

      const payload = {
        name: values.name,
        unit: values.unit,
        pricePerUnit: values.pricePerUnit,
        currentStock: values.currentStock,
        category: categoryId ? { id: categoryId } : null,
      };

      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        message.success("Product updated.");
      } else {
        await api.post("/products", payload);
        message.success("Product created.");
      }
      setProductModalOpen(false);
      fetchAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error("Failed to save product.");
    }
  };

  const handleDeleteProduct = async (record) => {
    if (record.variants.length > 0) {
      message.error("Delete this product's variants first, then delete the product.");
      return;
    }
    try {
      await api.delete(`/products/${record.id}`);
      message.success("Product deleted.");
      fetchAll();
    } catch (err) {
      if (!err.response) {
        message.error("Can't reach the server. Is the backend running?");
      } else if (err.response.status === 409) {
        message.error(
          err.response.data?.message ||
            "This product still has variants attached — delete those first."
        );
      } else if (err.response.status === 403) {
        message.error("Only a director can delete a product.");
      } else {
        message.error("Failed to delete product.");
      }
    }
  };

  const openAddCategory = () => {
    setEditingCategory(null);
    categoryForm.resetFields();
    setCategoryModalOpen(true);
  };

  const openEditCategory = (categoryRow) => {
    setEditingCategory(categoryRow);
    categoryForm.setFieldsValue({ name: categoryRow.name });
    setCategoryModalOpen(true);
  };

  // CHANGED: `name` is now already live-capitalized as the user typed it
  // (see the Form.Item's `normalize` prop below), so submit only trims
  // stray leading/trailing whitespace before sending -- it no longer calls
  // the (trim + collapse) capitalizeWords function a second time, which
  // would just be redundant work at this point.
  const handleCategorySubmit = async () => {
    try {
      const values = await categoryForm.validateFields();
      const name = values.name.trim();

      if (editingCategory) {
        await api.put(`/categories/${editingCategory.id}`, { name });
        message.success("Category renamed.");
      } else {
        await api.post("/categories", { name });
        message.success("Category created.");
      }
      setCategoryModalOpen(false);
      fetchAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error("Failed to save category.");
    }
  };

  const handleDeleteCategory = async (categoryRow) => {
    try {
      await api.delete(`/categories/${categoryRow.id}`);
      message.success("Category deleted.");
      fetchAll();
    } catch (err) {
      if (!err.response) {
        message.error("Can't reach the server. Is the backend running?");
      } else if (err.response.status === 403) {
        message.error("Only a director can delete a category.");
      } else {
        message.error("Failed to delete category.");
      }
    }
  };

  const openAddVariant = (product) => {
    setEditingVariant(null);
    setVariantParentProduct(product);
    variantForm.resetFields();
    setVariantModalOpen(true);
  };

  const openEditVariant = (record) => {
    setEditingVariant(record);
    setVariantParentProduct(record.product);
    variantForm.setFieldsValue({
      size: record.size,
      producer: record.producer,
      pricePerUnit: record.pricePerUnit,
      currentStock: record.currentStock,
    });
    setVariantModalOpen(true);
  };

  const handleVariantSubmit = async () => {
    try {
      const values = await variantForm.validateFields();
      const payload = {
        ...values,
        product: { id: variantParentProduct.id },
      };

      if (editingVariant) {
        await api.put(`/product-variants/${editingVariant.id}`, payload);
        message.success("Variant updated.");
      } else {
        await api.post("/product-variants", payload);
        message.success("Variant added.");
      }
      setVariantModalOpen(false);
      fetchAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error("Failed to save variant.");
    }
  };

  // CHANGED: previously a single generic message.error() on any failure.
  // Now mirrors handleDeleteProduct's branching exactly -- network/403/409
  // get their own specific messages, everything else falls to a generic
  // one. This was open question #1 from the earlier handoff list.
  const handleDeleteVariant = async (id) => {
    try {
      await api.delete(`/product-variants/${id}`);
      message.success("Variant deleted.");
      fetchAll();
    } catch (err) {
      if (!err.response) {
        message.error("Can't reach the server. Is the backend running?");
      } else if (err.response.status === 409) {
        message.error(
          err.response.data?.message ||
            "This variant is still referenced elsewhere — can't delete."
        );
      } else if (err.response.status === 403) {
        message.error("Only a director can delete a variant.");
      } else {
        message.error("Failed to delete variant.");
      }
    }
  };

  const openStockEdit = (type, record) => {
    setStockTarget({ type, record });
    stockForm.resetFields();
    stockForm.setFieldsValue({ currentStock: record.currentStock });
    setStockModalOpen(true);

    setStockHistoryLoading(true);
    const endpoint =
      type === "product"
        ? `/stock-adjustments/product/${record.id}`
        : `/stock-adjustments/variant/${record.id}`;
    api
      .get(endpoint)
      .then((res) => setStockHistory(res.data))
      .catch(() => setStockHistory([]))
      .finally(() => setStockHistoryLoading(false));
  };

  const handleStockSubmit = async () => {
    try {
      const values = await stockForm.validateFields();
      const { type, record } = stockTarget;

      await api.post("/stock-adjustments", {
        productId: type === "product" ? record.id : record.product.id,
        productVariantId: type === "variant" ? record.id : null,
        newStock: values.currentStock,
        reason: values.reason,
      });

      message.success("Stock updated.");
      setStockModalOpen(false);
      fetchAll();
    } catch (err) {
      if (err?.errorFields) return;
      if (err.response?.status === 403) {
        message.error("Only a director can adjust stock.");
      } else if (err.response?.status === 400) {
        message.error(err.response.data?.message || "Invalid stock adjustment.");
      } else {
        message.error("Failed to update stock.");
      }
    }
  };

  const variantColumns = [
    { title: "Producer", dataIndex: "producer", key: "producer" },
    { title: "Size", dataIndex: "size", key: "size" },
    {
      title: "Price",
      dataIndex: "pricePerUnit",
      key: "pricePerUnit",
      render: (value) => `₦${value?.toLocaleString() ?? "-"}`,
    },
    { title: "Stock", dataIndex: "currentStock", key: "currentStock" },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditVariant(record)}>
            Edit
          </Button>
          {isDirector && (
            <Button size="small" onClick={() => openStockEdit("variant", record)}>
              Edit Stock
            </Button>
          )}
          {isDirector && (
            <Popconfirm
              title="Delete this variant?"
              description="This cannot be undone."
              onConfirm={() => handleDeleteVariant(record.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const productColumns = [
    { title: "Product", dataIndex: "name", key: "name" },
    { title: "Unit", dataIndex: "unit", key: "unit" },
    {
      title: "Price",
      key: "price",
      render: (_, record) =>
        record.variants.length > 0 ? (
          <Text type="secondary">See variants</Text>
        ) : (
          `₦${record.pricePerUnit?.toLocaleString() ?? "-"}`
        ),
    },
    // CHANGED: previously always showed "See variants" as placeholder text
    // for any product with variants. Now sums each variant's currentStock
    // and shows the real total -- the number that matters when someone's
    // scanning the top-level list without expanding every row.
    {
      title: "Stock",
      key: "stock",
      render: (_, record) =>
        record.variants.length > 0 ? (
          record.variants.reduce((sum, v) => sum + (v.currentStock ?? 0), 0)
        ) : (
          record.currentStock
        ),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Space wrap>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditProduct(record)}>
              Edit
            </Button>
            <Button size="small" onClick={() => openAddVariant(record)}>
              Add Variant
            </Button>
            {isDirector && record.variants.length === 0 && (
              <Button size="small" onClick={() => openStockEdit("product", record)}>
                Edit Stock
              </Button>
            )}
            {isDirector && record.variants.length > 0 && (
              <Tooltip title="Delete this product's variants first, then you can delete the product.">
                <Button size="small" danger icon={<DeleteOutlined />} disabled />
              </Tooltip>
            )}
            {isDirector && record.variants.length === 0 && (
              <Popconfirm
                title="Delete this product?"
                description="This cannot be undone."
                onConfirm={() => handleDeleteProduct(record)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        </div>
      ),
    },
  ];

  const productExpandable = {
    rowExpandable: (record) => record.variants.length > 0,
    expandRowByClick: true,
    expandedRowRender: (record) => (
      <Table columns={variantColumns} dataSource={record.variants} rowKey="id" pagination={false} />
    ),
  };

  const categoryColumns = [
    { title: "Category", dataIndex: "name", key: "name" },
    {
      title: "Products",
      key: "productCount",
      render: (_, record) => record.products.length,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Space wrap>
            {!record.isUncategorized && (
              <Button size="small" icon={<PlusOutlined />} onClick={() => openAddProduct(record)}>
                Add Product
              </Button>
            )}
            {!record.isUncategorized && (
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditCategory(record)}>
                Rename
              </Button>
            )}
            {!record.isUncategorized && isDirector && (
              <Popconfirm
                title="Delete this category?"
                description={
                  record.products.length > 0
                    ? `${record.products.length} product(s) in this category will become Uncategorized. Continue?`
                    : "This cannot be undone."
                }
                onConfirm={() => handleDeleteCategory(record)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        </div>
      ),
    },
  ];

  const categoryExpandable = {
    rowExpandable: (record) => record.products.length > 0,
    expandRowByClick: true,
    expandedRowRender: (record) => (
      <Table
        columns={productColumns}
        dataSource={record.products}
        rowKey="id"
        pagination={false}
        expandable={productExpandable}
      />
    ),
  };

  return (
    <div style={{ padding: "16px" }}>
      <Row justify="space-between" align="middle" wrap style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            Products
          </Title>
          <Text type="secondary">Manage your categories, products, and variants.</Text>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddCategory}>
            Add Category
          </Button>
        </Col>
      </Row>

      {errorMsg && <Text type="danger">{errorMsg}</Text>}

      {!loading && !errorMsg && categoryRows.length === 0 && (
        <Empty description="No categories yet — add your first category to get started." />
      )}

      {(categoryRows.length > 0 || loading) && (
        <Table
          columns={categoryColumns}
          dataSource={categoryRows}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: true }}
          expandable={categoryExpandable}
        />
      )}

      <Modal
        title={editingCategory ? "Rename Category" : "Add Category"}
        open={categoryModalOpen}
        onOk={handleCategorySubmit}
        onCancel={() => setCategoryModalOpen(false)}
        destroyOnClose
      >
        <Form form={categoryForm} layout="vertical">
          <Form.Item
            name="name"
            label="Category Name"
            rules={[{ required: true, message: "Category name is required." }]}
            normalize={(value) => liveCapitalize(value)}
          >
            <Input placeholder="e.g. Tiles, Cement, Doors" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          editingProduct ? "Edit Product" : `Add Product — ${addTargetCategory?.name ?? ""}`
        }
        open={productModalOpen}
        onOk={handleProductSubmit}
        onCancel={() => setProductModalOpen(false)}
        destroyOnClose
      >
        <Form form={productForm} layout="vertical">
          <Form.Item name="name" label="Product Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="unit" label="Unit" rules={[{ required: true }]}>
            <Input placeholder="e.g. bags, lengths, cartons" />
          </Form.Item>

          {editingProduct && (
            <Form.Item name="categoryId" label="Category">
              <Select
                showSearch
                allowClear
                placeholder="Select or create a category"
                options={categoryOptions}
                filterOption={false}
                onSearch={setCategorySearch}
                onChange={handleCategorySelectChange}
                notFoundContent={null}
              />
            </Form.Item>
          )}

          <Form.Item
            name="pricePerUnit"
            label="Price Per Unit"
            rules={[{ required: false }]}
            tooltip="Only used if this product has no variants. Variants each have their own price."
          >
            <InputNumber style={{ width: "100%" }} min={0} prefix="₦" />
          </Form.Item>
          <Form.Item
            name="currentStock"
            label="Current Stock"
            rules={[{ required: false }]}
            tooltip="Only used if this product has no variants. Variants each have their own stock."
          >
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          editingVariant
            ? `Edit Variant — ${variantParentProduct?.name ?? ""}`
            : `Add Variant — ${variantParentProduct?.name ?? ""}`
        }
        open={variantModalOpen}
        onOk={handleVariantSubmit}
        onCancel={() => setVariantModalOpen(false)}
        destroyOnClose
      >
        <Form form={variantForm} layout="vertical">
          <Form.Item name="size" label="Size" rules={[{ required: true }]}>
            <Input placeholder="e.g. 40x40, 12mm" />
          </Form.Item>
          <Form.Item name="producer" label="Producer">
            <Input placeholder="e.g. Portobello, Dangote" />
          </Form.Item>
          <Form.Item name="pricePerUnit" label="Price Per Unit" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={0} prefix="₦" />
          </Form.Item>
          <Form.Item name="currentStock" label="Current Stock" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Edit Stock"
        open={stockModalOpen}
        onOk={handleStockSubmit}
        onCancel={() => setStockModalOpen(false)}
        destroyOnClose
      >
        <Form form={stockForm} layout="vertical">
          <Form.Item name="currentStock" label="New Stock Value" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason for adjustment"
            rules={[{ required: true, message: "A reason is required for manual stock edits." }]}
          >
            <Input.TextArea rows={3} placeholder="e.g. customer return, recount correction, damaged goods" />
          </Form.Item>
        </Form>

        <Text strong>Adjustment history</Text>
        <Table
          style={{ marginTop: 8 }}
          size="small"
          loading={stockHistoryLoading}
          dataSource={stockHistory}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: "No adjustments yet." }}
          columns={[
            { title: "Previous", dataIndex: "previousStock", key: "previousStock" },
            { title: "New", dataIndex: "newStock", key: "newStock" },
            { title: "Reason", dataIndex: "reason", key: "reason" },
            { title: "By", dataIndex: "adjustedByName", key: "adjustedByName" },
            {
              title: "When",
              dataIndex: "createdAt",
              key: "createdAt",
              render: (v) => new Date(v).toLocaleString(),
            },
          ]}
        />
      </Modal>
    </div>
  );
}