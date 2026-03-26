import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import LandingPage from './pages/LandingPage';
import QuizPage from './pages/QuizPage';
import BuzzerPage from './pages/BuzzerPage';
import DashboardPage from './pages/DashboardPage';

function RequireTeamAuth({ children }) {
  const token = localStorage.getItem('teamToken');
  return token ? children : <Navigate to="/" replace />;
}

function RequireAdminAuth({ children }) {
  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/admin" replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/landing" element={<RequireTeamAuth><LandingPage /></RequireTeamAuth>} />
          <Route path="/quiz" element={<RequireTeamAuth><QuizPage /></RequireTeamAuth>} />
          <Route path="/buzzer" element={<RequireTeamAuth><BuzzerPage /></RequireTeamAuth>} />
          <Route path="/dashboard" element={<RequireAdminAuth><DashboardPage /></RequireAdminAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
