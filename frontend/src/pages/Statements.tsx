import { Navigate } from 'react-router-dom';

/**
 * /statements is superseded by FinancialCenter (/financial?tab=statement).
 * This redirect preserves any existing bookmarks without breaking navigation.
 */
export default function Statements() {
  return <Navigate to="/financial?tab=statement" replace />;
}
