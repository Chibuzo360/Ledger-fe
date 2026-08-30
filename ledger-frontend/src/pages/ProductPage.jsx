import React, { useState, useEffect, useMemo } from "react";
import {
  Row,
  Col,
  Card,
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
  Tooltip, // NEW: used to explain the disabled delete button
  Empty, // NEW: empty state when there are no products yet
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";

const { Title, Text } = Typography;

const CREATE_NEW_VALUE = "__create_new__";

export default function ProductPage() {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  // CHANGED: hasVariant/setHadVariant removed — it was declared but never
  // read anywhere. Each row already carries its own `variants` array (see
  // groupedByCategory below), so `record.variants.length > 0` is the single
  // source of truth for "does this product have variants" — no separate
  // piece of state needed, and no risk of it going stale.

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm] = Form.useForm();
  const [categorySearch, setCategorySearch] = useState("");

  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [variantParentProduct, setVariantParentProduct] = useState(null);
  const [variantForm] = Form.useForm();

  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState(null);
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

  const groupedByCategory = useMemo(() => {
    const groups = {};
    // each product should have a category name chosen based on the given conditions and a productVariant name with the consditions.
    // recall that the product have been previously set to the response data of "/products" when we called through the api

    products.forEach((product) => {
      const categoryName = product.category
        ? product.category.name
        : "Uncategorized"; 
      const productVariants = variants.filter(
        (v) => v.product && v.product.id === product.id,
      );
      // putting product and variants in the an object,"row". Products already has its own value(from the "for each line").
      const row = { ...product, variants: productVariants };
      if (!groups[categoryName]) groups[categoryName] = [];
      groups[categoryName].push(row);
    });


    return groups;
  }, [products, variants]);

  const categoryOptions = useMemo(() => {
    const search = categorySearch.trim();
    const filtered = search
      ? categories.filter((c) =>
          c.name.toLowerCase().includes(search.toLowerCase()),
        )
      : categories;
    const base = filtered.map((c) => ({ label: c.name, value: c.id }));
    const alreadyExists = categories.some(
      (c) => c.name.toLowerCase() === search.toLowerCase(),
    );
    if (search && !alreadyExists) {
      base.push({ label: `+ Create "${search}"`, value: CREATE_NEW_VALUE });
    }
    return base;
  }, [categories, categorySearch]);

  const openAddProduct = () => {
    setEditingProduct(null);
    productForm.resetFields();
    setCategorySearch("");
    setProductModalOpen(true);
  };

  const openEditProduct = (record) => {
    setEditingProduct(record);
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
      let categoryId = values.categoryId;

      if (categoryId === CREATE_NEW_VALUE) {
        const created = await api.post("/categories", {
          name: categorySearch.trim(),
        });
        categoryId = created.data.id;
        setCategories((prev) => [...prev, created.data]);
      }

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
    // CHANGED: guard duplicated here (not just in the button render below).
    // The button already prevents this via `disabled`, but this function is
    // the actual thing that talks to the backend — if it's ever called from
    // somewhere else later, or `record.variants` is stale for any reason,
    // this stops the request before it's sent rather than relying only on
    // the UI having rendered correctly.
    if (record.variants.length > 0) {
      message.error("Delete this product's variants first, then delete the product.");
      return;
    }
    try {
      await api.delete(`/products/${record.id}`);
      message.success("Product deleted.");
      fetchAll();
    } catch (err) {
      // CHANGED: branch on the response instead of one generic message,
      // same pattern LoginPage already uses (no response vs. specific
      // status vs. everything else). This is what actually surfaces the
      // backend's new 409 check to the person clicking the button —
      // without this, a real "variants exist" rejection and a dead
      // backend look identical to the director.
      if (!err.response) {
        message.error("Can't reach the server. Is the backend running?");
      } else if (err.response.status === 409) {
        // Backend's ResponseStatusException message, when present, is the
        // most accurate text we can show ("...active Variants."). Falling
        // back to a hardcoded string only if the body doesn't have one.
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

  const variantColumns = [
    // CHANGED: Producer moved to the first (leftmost) column, per request.
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
      // CHANGED: wrapped in a div with stopPropagation, because expandRowByClick
      // (added below) makes the whole <tr> clickable to expand/collapse variants.
      // Without this, clicking any action button (Edit, Delete, etc.) would also
      // toggle the row's expand state as the click bubbles up — e.g. clicking
      // "Edit" would open the modal AND expand/collapse the row at once.
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
            {/* CHANGED: a product with variants can no longer be deleted at
                all, not just warned about. The delete button is disabled
                and wrapped in a Tooltip explaining why, instead of a
                Popconfirm that still lets the delete through. Variants must
                be removed one by one (via the expanded row's own delete
                button) before the product itself becomes deletable. */}
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

  const expandableConfig = {
    rowExpandable: (record) => record.variants.length > 0,
    expandRowByClick: true, // NEW: click anywhere on the product row to expand, not just the small caret icon
    expandedRowRender: (record) => (
      <Table columns={variantColumns} dataSource={record.variants} rowKey="id" pagination={false} />
    ),
  };

  return (
    <div style={{ padding: "16px" }}>
      <Space orientation="vertical" size="large" style={{ width: "100%" }}>
        <Row justify="space-between" align="middle" wrap>
          <Col>
            <Title level={3} style={{ margin: 0 }}>
              Products
            </Title>
            <Text type="secondary">
              Manage your product catalog, categories, and variants.
            </Text>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAddProduct}>
              Add Product
            </Button>
          </Col>
        </Row>

        {errorMsg && <Text type="danger">{errorMsg}</Text>}

        {/* NEW: explicit empty state. Without this, an empty `products` array
            means groupedByCategory is `{}`, and Object.entries({}).map(...)
            renders nothing at all — no Card, no message, just blank space
            where the page content should be. This makes the "there's genuinely
            nothing here yet" case visible instead of looking like a load failure. */}
        {!loading && !errorMsg && products.length === 0 && (
          <Empty description="No products yet — add your first product to get started." />
        )}

        {Object.entries(groupedByCategory).map(([categoryName, categoryProducts]) => (
          <Row key={categoryName}>
            <Card title={categoryName} variant="plain" style={{ width: "100%" }}>
              <Table
                columns={productColumns}
                dataSource={categoryProducts}
                rowKey="id"
                loading={loading}
                pagination={false}
                scroll={{ x: true }}
                expandable={expandableConfig}
              />
            </Card>
          </Row>
        ))}
      </Space>

      <Modal
        title={editingProduct ? "Edit Product" : "Add Product"}
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
          <Form.Item name="categoryId" label="Category">
            <Select
              showSearch
              allowClear
              placeholder="Select or create a category"
              options={categoryOptions}
              filterOption={false}
              onSearch={setCategorySearch}
              notFoundContent={null}
            />
          </Form.Item>
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
            rules={[{ required: false }]} // CHANGED: was required: true — same bug as pricePerUnit had. A variant-having product doesn't use this field at all, so it can't be mandatory.
            tooltip="Only used if this product has no variants. Variants each have their own stock."
          >
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingVariant ? `Edit Variant — ${variantParentProduct?.name ?? ""}` : `Add Variant — ${variantParentProduct?.name ?? ""}`}
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
      </Modal>
    </div>
  );
}