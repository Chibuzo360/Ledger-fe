import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";
import { Form, Input, Card, Button, message } from "antd";


 const LoginPage = () => {
    const {login} = useAuth();
    const navigate = useNavigate();// i'll use this to hook in to my react router dm to handle navigation
    const [loading,setLoading] = useState(false);

    const onFinish = async(values) => {
        setLoading(true)
        try{
            const response = await api.post('/auth/login', values)
            const { token, role, identifier } = response.data
            login(token,role,identifier)
            message.success('Welcome Back')
            navigate('/dashboard')

        }catch(error){
            console.error(error);
            const errorMessage = error.response?.data.message || 'Invalid email/phone or password'
            message.error(errorMessage);
        }finally{
            setLoading(false); 
        }
    };

    return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f0f2f5' }}>
      <Card title="CAV Ledger Login" style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <Form name="login_form" onFinish={onFinish} layout="vertical">
          
          <Form.Item
            label="Email or Phone Number"
            name="identifier"
            rules={[{ required: true, message: 'Please input your Email or Phone number!' }]}
          >
            <Input placeholder="Enter email or phone" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password placeholder="Enter password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Log in
            </Button>
          </Form.Item>

        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;