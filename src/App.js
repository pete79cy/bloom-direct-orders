import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
        queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
    },
});
export default function App() {
    return (_jsxs(QueryClientProvider, { client: queryClient, children: [_jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(Login, {}) }), _jsx(Route, { path: "/", element: _jsx(Home, {}) }), _jsx(Route, { path: "/orders", element: _jsx(OrdersList, {}) }), _jsx(Route, { path: "/orders/new", element: _jsx(NewOrderWizard, {}) }), _jsx(Route, { path: "/orders/:id", element: _jsx(OrderDetail, {}) }), _jsx(Route, { path: "/calendar", element: _jsx(Calendar, {}) })] }) }), _jsx(Toaster, { position: "top-center", richColors: true })] }));
}
