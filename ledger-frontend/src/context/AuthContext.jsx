import React, { createContext, useState, useContext } from 'react';

// 1. Create the actual Context object
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // 2. Initialize State lazily from localStorage so page refreshes don't log users out
  const [token, setToken] = useState(() => {
    return localStorage.getItem('token') || null; 
  });

  const [user, setUser] = useState(() => {
    const role = localStorage.getItem('role');
    const identifier = localStorage.getItem('identifier');
    if(role && identifier){
        return {role: role , identifier: identifier}
    }else{
        return null; 
    }
    //  If role AND identifier exist, return an object { role, identifier }. Otherwise, return null.
    
  });

  const login = (tokenData, roleData, identifierData) => {
  // a) Update React memory state
  setToken(tokenData);
  setUser({ role: roleData, identifier: identifierData });

  // b) Persist to browser storage (Key, Value strings)
  localStorage.setItem('token', tokenData);
  localStorage.setItem('role', roleData);
  localStorage.setItem('identifier', identifierData);
};

 const logout = () => {
  // a) Reset React memory state back to empty
  setToken(null);
  setUser(null);

  // b) Evict the keys from browser storage completely
  localStorage.removeItem('token');
  localStorage.removeItem('role');
  localStorage.removeItem('identifier');
}; 

  // 5. Pass the states and functions into the Provider value
  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// 6. Custom hook for clean imports in other components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};