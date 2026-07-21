import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout'; 
import LoginPage from './pages/LoginPage';     
import DashboardPage from './pages/DashboardPage';
import RegisterPage from './pages/RegistrationPage';
import TransactionsPage from './pages/TransactionsPage';
import ExpensesPage from './pages/ExpensesPage';
import RetailersPage from './pages/RetailersPage';

// import './index.css'; 

// Temporary placeholders until we build the real pages
// const TransactionsPlaceholder = () => <div style={{ padding: 50 }}><h2>Transactions Table</h2></div>;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route - Using your real LoginPage component now! */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} /> 

          {/* Protected Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path='/transactions' element={<TransactionsPage/>} />
            <Route path='/expenses' element={<ExpensesPage/>} />
            <Route path='/retailers' element={<RetailersPage/>} />
          </Route>
          
          {/* Root redirect: Send users to /dashboard by default */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);