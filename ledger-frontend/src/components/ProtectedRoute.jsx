import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { token } = useAuth(); // Grabs the token from our new context

  if (!token) { 
    return <Navigate to="/login" replace />; // Explicitly return the redirect!
  }
  
  return children;
};

export default ProtectedRoute;