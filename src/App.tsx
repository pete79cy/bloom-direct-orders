import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import Login from './pages/Login';
import Home from './pages/Home';
import OrdersList from './pages/OrdersList';
import OrderDetail from './pages/OrderDetail';
import Calendar from './pages/Calendar';
import NewOrderWizard from './pages/NewOrderWizard';

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
          <Route path="/" element={<Home />} />
          <Route path="/orders" element={<OrdersList />} />
          <Route path="/orders/new" element={<NewOrderWizard />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/calendar" element={<Calendar />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}
