import { ReactNode } from 'react';

interface Props {
  /** The actual control buttons (Print, Copies, Back, page-specific extras). */
  children: ReactNode;
}

/**
 * Presentational top bar for the print workspace. It only lays out the controls
 * it is given — it never invents business actions. Marked `pw-chrome` so it is
 * hidden in print.
 */
export default function PrintWorkspaceToolbar({ children }: Props) {
  return <div className="pw-toolbar pw-chrome">{children}</div>;
}
