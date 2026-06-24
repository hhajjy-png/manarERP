import { useAuth } from '../../stores/authStore';

interface Tab { key: string; label: string; permission: string; }
interface Props { tabs: Tab[]; activeTab: string; onTabChange: (key: string) => void; }

export function FinancialTabs({ tabs, activeTab, onTabChange }: Props) {
  const { hasPermission } = useAuth();
  const visible = tabs.filter(t => hasPermission(t.permission));

  return (
    <div className="financial-tabs" role="tablist">
      {visible.map(tab => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`financial-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
