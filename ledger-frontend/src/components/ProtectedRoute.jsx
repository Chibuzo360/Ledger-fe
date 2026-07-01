import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { token } = useAuth(); // Grabs the token from our new context

  // TODO: Write an if statement. 
  // If there is NO token, return the <Navigate to="/login" replace /> component.
  // Otherwise, return children.

  if (!token){
    <Navigate to={"/login"} replace/>
  }
    return children
  
};

export default ProtectedRoute;