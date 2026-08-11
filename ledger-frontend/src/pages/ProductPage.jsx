import React, { useState, useEffect, useMemo } from "react";
import {
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
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";

const { Title, Text } = Typography;

// Sentinel value used in the category <Select> to represent "create this as
// a new category" instead of picking an existing one.
const CREATE_NEW_VALUE = "__create_new__";

export default function ProductPage() {
  const { user } = useAuth();
  const isDirector = user?.role === "director";

  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- Add/Edit Product modal ---
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm] = Form.useForm();
  const [categorySearch, setCategorySearch] = useState("");

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
        message.error("Can't reach the server.");
      } else {
        message.error(`Failed to save: ${error.response.status}`);
      }
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // ---------------------------------------------------------------------
  // Grouping: the backend gives us flat products and flat variants
  // separately. We attach each variant to its parent product (matching on
  // variant.product.id), then bucket products by category name so we can
  // render one table per category. Products with no category fall into
  // "Uncategorized" rather than being dropped.
  // ---------------------------------------------------------------------
  const groupedByCategory = useMemo(() => {
    const groups = {};
    products.forEach((product) => {
      const categoryName = product.category
        ? product.category.name
        : "Uncategorized";
      const productVariants = variants.filter(
        (v) => v.product && v.product.id === product.id,
      );
      const row = { ...product, variants: productVariants };
      if (!groups[categoryName]) groups[categoryName] = [];
      groups[categoryName].push(row);
    });
    return groups;
  }, [products, variants]);

  // ---------------------------------------------------------------------
  // Category <Select> options, with inline "create new" support.
  // If the user's search text doesn't match an existing category name,
  // we append a synthetic option for creating it on the fly.
  // ---------------------------------------------------------------------
  const categoryOptions = useMemo(() => {
    const base = categories.map((c) => ({ label: c.name, value: c.id }));
    const search = categorySearch.trim();
    const alreadyExists = categories.some(
      (c) => c.name.toLowerCase() === search.toLowerCase(),
    );
    if (search && !alreadyExists) {
      base.push({ label: `+ Create "${search}"`, value: CREATE_NEW_VALUE });
    }
    return base;
  }, [categories, categorySearch]);

  // ---------------------------------------------------------------------
  // Product modal handlers
  // ---------------------------------------------------------------------
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

      // If the user picked the synthetic "create new" option, create the
      // category first, then use its real id in the product payload.
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
      if (err?.errorFields) return; // antd form validation error, already shown inline
      message.error("Failed to save product.");
    }
  };

  const handleDeleteProduct = async (id) => {
    try {
      await api.delete(`/products/${id}`);
      message.success("Product deleted.");
      fetchAll();
    } catch (err) {
      message.error("Failed to delete product.");
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
  // Stock edit modal (director only). Reuses the product/variant edit
  // endpoints rather than a dedicated one, since none exists yet.
  //
  // KNOWN GAP: there's no backend field/table to persist `reason` yet
  // (no StockAdjustment entity, no audit log). It's included in the PUT
  // body below so it's visible in the request and easy to wire up once
  // the backend has somewhere to put it, but until then Spring will just
  // ignore the unknown field silently. Flagging this rather than pretending
  // it's fully wired end-to-end.
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
          stockEditReason: values.reason, // see KNOWN GAP note above
        });
      } else {
        await api.put(`/product-variants/${record.id}`, {
          size: record.size,
          producer: record.producer,
          pricePerUnit: record.pricePerUnit,
          currentStock: values.currentStock,
          product: { id: record.product.id },
          stockEditReason: values.reason, // see KNOWN GAP note above
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
  // Table column definitions
  // ---------------------------------------------------------------------
  const variantColumns = [
    { title: "Size", dataIndex: "size", key: "size" },
    { title: "Producer", dataIndex: "producer", key: "producer" },
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
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditVariant(record)}
          >
            Edit
          </Button>
          {isDirector && (
            <Button
              size="small"
              onClick={() => openStockEdit("variant", record)}
            >
              Edit Stock
            </Button>
          )}
          {isDirector && (
            <Popconfirm
              title="Delete this variant?"
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
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditProduct(record)}
          >
            Edit
          </Button>
          <Button size="small" onClick={() => openAddVariant(record)}>
            Add Variant
          </Button>
          {isDirector && record.variants.length === 0 && (
            <Button
              size="small"
              onClick={() => openStockEdit("product", record)}
            >
              Edit Stock
            </Button>
          )}
          {isDirector && (
            <Popconfirm
              title="Delete this product?"
              onConfirm={() => handleDeleteProduct(record.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const expandableConfig = {
    rowExpandable: (record) => record.variants.length > 0,
    expandedRowRender: (record) => (
      <Table
        columns={variantColumns}
        dataSource={record.variants}
        rowKey="id"
        pagination={false}
      />
    ),
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ margin: 0 }}>
          Products
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddProduct}>
          Add Product
        </Button>
      </div>

      {Object.entries(groupedByCategory).map(
        ([categoryName, categoryProducts]) => (
          <div key={categoryName} style={{ marginBottom: 32 }}>
            <Title level={5}>{categoryName}</Title>
            <Table
              columns={productColumns}
              dataSource={categoryProducts}
              rowKey="id"
              loading={loading}
              pagination={false}
              expandable={expandableConfig}
            />
          </div>
        ),
      )}

      {/* Add/Edit Product modal */}
      <Modal
        title={editingProduct ? "Edit Product" : "Add Product"}
        open={productModalOpen}
        onOk={handleProductSubmit}
        onCancel={() => setProductModalOpen(false)}
        destroyOnClose
      >
        <Form form={productForm} layout="vertical">
          <Form.Item
            name="name"
            label="Product Name"
            rules={[{ required: true }]}
          >
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
            rules={[{ required: true }]}
            tooltip="Only used if this product has no variants. Variants each have their own price."
          >
            <InputNumber style={{ width: "100%" }} min={0} prefix="₦" />
          </Form.Item>
          <Form.Item
            name="currentStock"
            label="Current Stock"
            rules={[{ required: true }]}
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
          <Form.Item
            name="pricePerUnit"
            label="Price Per Unit"
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: "100%" }} min={0} prefix="₦" />
          </Form.Item>
          <Form.Item
            name="currentStock"
            label="Current Stock"
            rules={[{ required: true }]}
          >
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
          <Form.Item
            name="currentStock"
            label="New Stock Value"
            rules={[{ required: true }]}
          >
            <InputNumber style={{ width: "100%" }} min={0} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Reason for adjustment"
            rules={[
              {
                required: true,
                message: "A reason is required for manual stock edits.",
              },
            ]}
          >
            <Input.TextArea
              rows={3}
              placeholder="e.g. customer return, recount correction, damaged goods"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
