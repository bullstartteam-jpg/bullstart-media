import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Design from './pages/Design';
import Convert from './pages/Convert';
import Gangsheet from './pages/Gangsheet';
import Profile from './pages/Profile';
import { DialogHost } from './components/Dialog';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-900"><div className="text-slate-400">Loading...</div></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Design />} />
          <Route path="convert" element={<Convert />} />
          <Route path="gangsheet" element={<Gangsheet />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
      <DialogHost />
    </>
  );
}
