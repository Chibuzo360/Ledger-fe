import React, { useState } from "react";
import { Form, Input, Button, Card, message, Select } from "antd";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axiosConfig";

//this assumes there is a register route in my backend.

const RegisterPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      // Step 1: Create branch first
      const branchResponse = await api.post("/branch", {
        name: values.branchName,
      });
      const branchId = branchResponse.data.id;

      // Step 2: Register user with branch id
      await api.post("/auth/register", {
        name: values.name,
        email: values.email,
        phoneNumber: values.phoneNumber,
        password: values.password,
        role: values.role,
        branch: { id: branchId },
      });

      message.success("Account created successfully! Please log in.");
      navigate("/login");
    } catch (error) {
      console.error(error);
      message.error(error.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        backgroundColor: "#f0f2f5",
      }}
    >
      <Card
        title="Create CAV Ledger Account"
        style={{ width: 400, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
      >
        <Form name="register_form" onFinish={onFinish} layout="vertical">
          <Form.Item
            label="Full Name"
            name="name"
            rules={[{ required: true, message: "Please input your name!" }]}
          >
            <Input placeholder="Enter your full name" />
          </Form.Item>

          <Form.Item
            label="Email Address"
            name="email"
            rules={[
              {
                required: true,
                type: "email",
                message: "Please input a valid email!",
              },
            ]}
          >
            <Input placeholder="Enter your email" />
          </Form.Item>

          <Form.Item
            label="Phone Number"
            name="phoneNumber"
            rules={[
              { required: true, message: "Please input your phone number!" },
            ]}
          >
            <Input placeholder="Enter your phone number" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please set a password!" }]}
          >
            <Input.Password placeholder="Create a secure password" />
          </Form.Item>

          <Form.Item
            label="Role"
            name="role"
            rules={[{ required: true, message: "Please select a role" }]}
          >
            <Select placeholder="Select a role">
              <Select.Option value="director">Director</Select.Option>
              <Select.Option value="worker">Worker</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Branch"
            name="branchName"
            rules={[{ required: true, message: "Enter Branch Name" }]}
          >
            <Input placeholder="What Branch do you work at?" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Register Account
            </Button>
          </Form.Item>

          <div style={{ textAlign: "center" }}>
            Already have an account? <Link to="/login">Login here</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RegisterPage;
