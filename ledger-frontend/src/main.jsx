import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout'; // 1. Added this import!
import LoginPage from './pages/LoginPage';     // 2. Added this import!
import './index.css'; 

// Temporary placeholders until we build the real pages
const DashboardPlaceholder = () => <div style={{ padding: 50 }}><h2>Dashboard (Fintech style coming soon)</h2></div>;
const TransactionsPlaceholder = () => <div style={{ padding: 50 }}><h2>Transactions Table</h2></div>;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route - Using your real LoginPage component now! */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPlaceholder />} />
            <Route path='/transactions' element={<TransactionsPlaceholder />} />
          </Route>
          
          {/* Root redirect: Send users to /dashboard by default */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);