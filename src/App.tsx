import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import Home from './pages/Home';
import OrdersList from './pages/OrdersList';
import OrderDetail from './pages/OrderDetail';
import Calendar from './pages/Calendar';
import NewOrderWizard from './pages/NewOrderWizard';
import RequireAuth from './components/RequireAuth';
import PwaUpdateToast from './components/PwaUpdateToast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
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
          <Route path="/orders/new" element={<RequireAuth><NewOrderWizard /></RequireAuth>} />
          <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><Calendar /></RequireAuth>} />
        </Routes>
      </BrowserRouter>
      <PwaUpdateToast />
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
