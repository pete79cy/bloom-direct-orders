import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import Home from './pages/Home';
import OrdersList from './pages/OrdersList';
import OrderDetail from './pages/OrderDetail';
import AddCustomerPage from './pages/AddCustomerPage';
import Calendar from './pages/Calendar';
import NewOrderWizard from './pages/NewOrderWizard';
import { lazy, Suspense } from 'react';

// Quote screens load on first visit — keeps the start-up bundle the size it
// was before quotes existed (orders remain the hot path at the counter).
const QuotesList = lazy(() => import('./pages/QuotesList'));
const QuoteDetail = lazy(() => import('./pages/QuoteDetail'));
const pageFallback = <p style={{ padding: 24, fontSize: 14, color: 'var(--ink-500)' }}>Φόρτωση…</p>;
import RequireAuth from './components/RequireAuth';
import PwaUpdateToast from './components/PwaUpdateToast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      // Refetch when the user returns to the PWA tab (e.g. after creating
      // a plant in bloom-crm desktop). Without this the catalog stays
      // stuck on whatever was cached when the wizard first opened.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/orders" element={<RequireAuth><OrdersList /></RequireAuth>} />
          <Route path="/customers/new" element={<RequireAuth><AddCustomerPage /></RequireAuth>} />
          <Route path="/orders/new" element={<RequireAuth><NewOrderWizard key="order" mode="order" /></RequireAuth>} />
          <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
          <Route path="/quotes" element={<RequireAuth><Suspense fallback={pageFallback}><QuotesList /></Suspense></RequireAuth>} />
          <Route path="/quotes/new" element={<RequireAuth><NewOrderWizard key="quote" mode="quote" /></RequireAuth>} />
          <Route path="/quotes/:id" element={<RequireAuth><Suspense fallback={pageFallback}><QuoteDetail /></Suspense></RequireAuth>} />
        </Routes>
      </BrowserRouter>
      <PwaUpdateToast />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
