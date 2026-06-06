import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/authStore';

/** يمنع الوصول للصفحات دون تسجيل دخول. */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, initialized } = useAuth();
  if (!initialized) {
    return (
      <div className="center-msg" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div>
          <div className="spinner" />
          جارٍ التحميل…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
