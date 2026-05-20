import { type ReactNode, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '@/lib/auth';
import { setUnauthorizedHandler } from '@/lib/api';

interface Props {
  children: ReactNode;
}

export default function RequireAuth({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      navigate('/login', { replace: true });
    });
  }, [navigate]);

  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
