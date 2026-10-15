import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { ModalProvider } from './contexts/ModalContext';
import { Toast } from './components/ui/Toast';
import { GlobalModal } from './components/modals/GlobalModal';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { Shell } from './components/layout/Shell';

// ---- Public (auth) pages ----
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { SSOPage } from './pages/auth/SSOPage';

// ---- Dashboard pages ----
import { OverviewPage } from './pages/OverviewPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { IncidentDetailPage } from './pages/IncidentDetailPage';
import { RunsPage } from './pages/RunsPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { MemoryPage } from './pages/MemoryPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { GraphExplorerPage } from './pages/GraphExplorerPage';
import { ServicesPage } from './pages/ServicesPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { TeamPage } from './pages/TeamPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

function Protected({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Shell>{children}</Shell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ModalProvider>
          <Routes>
            {/* -------- Public -------- */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/sso" element={<SSOPage />} />

            {/* -------- Dashboard (protected) -------- */}
            <Route path="/" element={<Protected><OverviewPage /></Protected>} />

            <Route path="/incidents" element={<Protected><IncidentsPage /></Protected>} />
            <Route path="/incidents/:id" element={<Protected><IncidentDetailPage /></Protected>} />

            <Route path="/runs" element={<Protected><RunsPage /></Protected>} />
            <Route path="/runs/:id" element={<Protected><RunDetailPage /></Protected>} />

            <Route path="/memory" element={<Protected><MemoryPage /></Protected>} />
            <Route path="/knowledge" element={<Protected><KnowledgePage /></Protected>} />
            <Route path="/graph" element={<Protected><GraphExplorerPage /></Protected>} />

            <Route path="/services" element={<Protected><ServicesPage /></Protected>} />
            <Route path="/services/:id" element={<Protected><ServiceDetailPage /></Protected>} />

            <Route path="/team" element={<Protected><TeamPage /></Protected>} />
            <Route path="/integrations" element={<Protected><IntegrationsPage /></Protected>} />
            <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />

            {/* -------- Fallback -------- */}
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>

          <Toast />
          <GlobalModal />
        </ModalProvider>
      </ToastProvider>
    </AuthProvider>
  );
}