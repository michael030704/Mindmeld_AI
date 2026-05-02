import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PrivateRoute({ children }) {
const { user, loading } = useAuth();

return loading ? (
  <div className="loading">Loading...</div>
) : user ? (
  children
) : (
  <Navigate to="/login" />
);
}