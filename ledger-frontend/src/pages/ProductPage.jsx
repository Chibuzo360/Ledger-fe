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
// Sentinel id for the synthetic "Uncategorized" row. Never sent to the
// backend — it only exists so the frontend has something to key/render
// products whose `category` is null (or whose category was just deleted
// and got orphaned by ProductCategoryService.deleteProductCategory()).
const UNCATEGORIZED_ID = "__uncategorized__";

// Title-cases a category name — "building materials" -> "Building Materials".
// Applied everywhere a category name is created or renamed, so naming stays
// consistent no matter how it was typed.
// KNOWN LIMITATION: this also lowercases the rest of each word, so a real
// acronym like "PVC" becomes "Pvc". No simple rule can tell "caps lock was
// on by accident" from "this is meant to be an acronym" — flagging rather
// than hiding it.
const capitalizeWords = (str) =>
  str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

export default function ProductPage() {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // --- Add/Edit Product modal ---
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  // Which category row "Add Product" was clicked from. Only used in add
  // mode — the product form no longer has a category field to read this
  // from, since category is scoped by context instead of picked in-form.
  const [addTargetCategory, setAddTargetCategory] = useState(null);
  const [productForm] = Form.useForm();
  const [categorySearch, setCategorySearch] = useState("");

  // --- Add/Rename Category modal ---
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null); // null = add mode
  const [categoryForm] = Form.useForm();

  // --- Add/Edit Variant modal ---
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [variantParentProduct, setVariantParentProduct] = useState(null);
  const [variantForm] = Form.useForm();

  // --- Director-only stock edit modal ---
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState(null); // { type: 'product' | 'variant', record }
  const [stockForm] = Form.useForm();

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

  // ---------------------------------------------------------------------
  // Three-level grouping: one row per Category — INCLUDING empty ones, so
  // a freshly-created category is visible immediately with "Add Product"
  // already scoped to it — each carrying its own `products` array, each
  // product carrying its own `variants` array. A synthetic "Uncategorized"
  // row is appended only when at least one product actually has no
  // category — it's never a real row you can rename/delete/add into.
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Category <Select> options — used ONLY in the Edit Product modal now.
  // Add Product has no category field at all (category comes from which
  // category row you clicked "Add Product" on), and top-level category
  // creation goes through the dedicated Add Category modal. This Select
  // stays in Edit mode because a director may want to move an existing
  // product to a category that doesn't exist yet.
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // BUG FIX: previously, selecting "+ Create ..." just stored the
  // CREATE_NEW_VALUE sentinel in the form and deferred actual creation
  // until form submit. That meant the Select kept displaying the "+
  // Create "x"" option's own label as its selected text for as long as
  // the modal stayed open, and `categorySearch` never got reset — so
  // reopening the dropdown started from that stale leftover text, and new
  // keystrokes landed after it instead of replacing it. That's the "box
  // fills with Create..., then my typed letters" glitch.
  //
  // Fix: create the category immediately, right here, the moment it's
  // selected — swap the sentinel out for the real new category's id
  // straight away — and always clear categorySearch after ANY selection
  // (not just the create-new case), so the Select never has stale search
  // text to fall back on.
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // Product modal handlers
  // ---------------------------------------------------------------------
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

      // In add mode there's no categoryId form field (it's hidden — see
      // the Modal JSX below), so the category comes from whichever
      // category row "Add Product" was clicked on. In edit mode it comes
      // from the Select, and by now it's always a real id — never the
      // CREATE_NEW_VALUE sentinel, since that gets resolved immediately in
      // handleCategorySelectChange above, not deferred to submit time.
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

  // ---------------------------------------------------------------------
  // Category modal handlers (Add + Rename). Delete is a plain Popconfirm
  // inline in categoryColumns below — no modal needed for that one.
  // ---------------------------------------------------------------------
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

  const handleCategorySubmit = async () => {
    try {
      const values = await categoryForm.validateFields();
      const name = capitalizeWords(values.name);

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

  // Unlike product/variant delete, category delete is NOT blocked when it
  // has products — the backend (ProductCategoryService.deleteProductCategory)
  // deliberately orphans them to "Uncategorized" instead of refusing. This
  // Popconfirm just makes that consequence visible before it happens; it
  // never disables the button the way the product-delete button does.
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

  // ---------------------------------------------------------------------
  // Variant modal handlers
  // ---------------------------------------------------------------------
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

  const handleDeleteVariant = async (id) => {
    try {
      await api.delete(`/product-variants/${id}`);
      message.success("Variant deleted.");
      fetchAll();
    } catch (err) {
      message.error("Failed to delete variant.");
    }
  };

  // ---------------------------------------------------------------------
  // Stock edit modal (director only)
  // ---------------------------------------------------------------------
  const openStockEdit = (type, record) => {
    setStockTarget({ type, record });
    stockForm.resetFields();
    stockForm.setFieldsValue({ currentStock: record.currentStock });
    setStockModalOpen(true);
  };

  const handleStockSubmit = async () => {
    try {
      const values = await stockForm.validateFields();
      const { type, record } = stockTarget;

      if (type === "product") {
        await api.put(`/products/${record.id}`, {
          name: record.name,
          unit: record.unit,
          pricePerUnit: record.pricePerUnit,
          currentStock: values.currentStock,
          category: record.category ? { id: record.category.id } : null,
          stockEditReason: values.reason, // KNOWN GAP: no backend column yet
        });
      } else {
        await api.put(`/product-variants/${record.id}`, {
          size: record.size,
          producer: record.producer,
          pricePerUnit: record.pricePerUnit,
          currentStock: values.currentStock,
          product: { id: record.product.id },
          stockEditReason: values.reason, // KNOWN GAP: same as above
        });
      }
      message.success("Stock updated.");
      setStockModalOpen(false);
      fetchAll();
    } catch (err) {
      if (err?.errorFields) return;
      message.error("Failed to update stock.");
    }
  };

  // ---------------------------------------------------------------------
  // Column definitions — three levels: Category, Product, Variant
  // ---------------------------------------------------------------------
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
    {
      title: "Stock",
      key: "stock",
      render: (_, record) =>
        record.variants.length > 0 ? (
          <Text type="secondary">See variants</Text>
        ) : (
          record.currentStock
        ),
    },
    {
      title: "Actions",
      key: "actions",
      // Wrapped with stopPropagation because this table's expandRowByClick
      // (below) makes the whole product <tr> clickable to expand/collapse
      // variants. Without it, clicking Edit/Delete/etc. would ALSO toggle
      // the row's expand state as the click bubbles up.
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

  // Category is now a real, top-level table row — this replaces the old
  // one-Card-per-category loop entirely.
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
            {/* "Uncategorized" is a synthetic bucket, not a real category —
                you can't add into it, rename it, or delete it. */}
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

      {/* Add/Rename Category modal */}
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
          >
            <Input placeholder="e.g. Tiles, Cement, Doors" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Add/Edit Product modal */}
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

          {/* Category field only shows in Edit mode. In Add mode, category
              is already fixed by which category row "Add Product" was
              clicked on — no field needed, no risk of picking the wrong
              one. */}
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

      {/* Add/Edit Variant modal */}
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

      {/* Director-only stock edit modal */}
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
      </Modal>
    </div>
  );
}