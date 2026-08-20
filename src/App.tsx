import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';
import Contacts from './components/Contacts';
import Settings from './components/Settings';
import Team from './components/Team';
import Scheduling from './components/Scheduling';
import Kanban from './components/Kanban';
import Cerebro from './components/Cerebro';
import Auth from './pages/Auth';
import ResetPassword from './pages/ResetPassword';
import Campaigns from './pages/Campaigns';
import Templates from './pages/Templates';
import TrackingSend from './pages/TrackingSend';

import ProtectedRoute from './components/ProtectedRoute';
import RoleGate from './components/RoleGate';

import { CompanySettingsProvider } from './hooks/useCompanySettings';
import { AuthProvider } from './hooks/useAuth';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from 'sonner';
import { OnboardingWizard } from './components/OnboardingWizard';
import { useOnboardingStatus } from './hooks/useOnboardingStatus';
import { useUserRole } from './hooks/useUserRole';


// Redireciona cada papel para a sua rota inicial (ex.: expedicao -> /tracking)
const HomeRedirect: React.FC = () => {
  const { homeRoute, loading } = useUserRole();
  if (loading) return null;
  return <Navigate to={homeRoute} replace />;
};

// Componente de Layout que envolve a aplicação principal
const AppLayout: React.FC = () => {

  const [showOnboarding, setShowOnboarding] = useState(false);
  const { isComplete, hasSeenWizard, loading } = useOnboardingStatus();

  // Show wizard automatically on first load if not complete and never seen
  useEffect(() => {
    if (!loading && !isComplete && !hasSeenWizard) {
      setShowOnboarding(true);
    }
  }, [loading, isComplete, hasSeenWizard]);

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[128px] pointer-events-none translate-x-1/2 translate-y-1/2 z-0"></div>
      
      <Sidebar />
      
      <main className="flex-1 h-full overflow-hidden relative z-10 flex flex-col">
        {/* Top Border Gradient */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent opacity-50 z-20"></div>
        
        <div className="flex-1 w-full h-full relative">
          <Outlet context={{ showOnboarding, setShowOnboarding }} />
        </div>
      </main>

      <OnboardingWizard 
        isOpen={showOnboarding} 
        onClose={() => setShowOnboarding(false)} 
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    // BrowserRouter é o wrapper mais externo: garante que TODO consumidor de
    // router (ProtectedRoute, Sidebar, providers) esteja dentro do contexto Router.
    // ErrorBoundary envolve tudo para que erros de render virem fallback, não tela branca.
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CompanySettingsProvider>
            <Routes>
              {/* Public Routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Protected Routes (With Sidebar) */}
              <Route element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/dashboard" element={<RoleGate area="dashboard"><Dashboard /></RoleGate>} />
                <Route path="/pipeline" element={<RoleGate area="pipeline"><Kanban /></RoleGate>} />
                <Route path="/chat" element={<RoleGate area="chat"><ChatInterface /></RoleGate>} />
                <Route path="/contacts" element={<RoleGate area="contacts"><Contacts /></RoleGate>} />
                <Route path="/scheduling" element={<RoleGate area="scheduling"><Scheduling /></RoleGate>} />
                <Route path="/campaigns" element={<RoleGate area="campaigns"><Campaigns /></RoleGate>} />
                <Route path="/templates" element={<RoleGate area="templates"><Templates /></RoleGate>} />
                {/* Rota oculta do menu — Fase 2A (envio desativado) */}
                <Route path="/tracking" element={<RoleGate area="tracking"><TrackingSend /></RoleGate>} />

                <Route path="/team" element={<RoleGate area="team"><Team /></RoleGate>} />
                <Route path="/cerebro" element={<RoleGate area="cerebro"><Cerebro /></RoleGate>} />
                <Route path="/settings" element={<RoleGate area="settings"><Settings /></RoleGate>} />
              </Route>

              {/* Catch all - redirect to dashboard */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster
              position="top-right"
              richColors
              theme="dark"
            />
          </CompanySettingsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
};

export default App;
