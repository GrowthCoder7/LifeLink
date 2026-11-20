import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { HOME_BY_ROLE, getSession } from './api/client.js';
import Login from './pages/Login.jsx';
import DonorApp from './pages/DonorApp.jsx';
import HospitalDashboard from './pages/HospitalDashboard.jsx';
import BloodBankConsole from './pages/BloodBankConsole.jsx';
import AdminConsole from './pages/AdminConsole.jsx';

// Client-side guard for navigation only; the gateway's RBAC is what actually protects data.
function RequireRole({ role, children }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== role) return <Navigate to={HOME_BY_ROLE[session.user.role]} replace />;
  return children;
}

function Home() {
  const session = getSession();
  return <Navigate to={session ? HOME_BY_ROLE[session.user.role] : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<DonorApp />} />
        <Route path="/donor" element={<RequireRole role="DONOR"><DonorApp /></RequireRole>} />
        <Route path="/hospital" element={<RequireRole role="HOSPITAL_STAFF"><HospitalDashboard /></RequireRole>} />
        <Route path="/bank" element={<RequireRole role="BLOODBANK_STAFF"><BloodBankConsole /></RequireRole>} />
        <Route path="/admin" element={<RequireRole role="ADMIN"><AdminConsole /></RequireRole>} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
