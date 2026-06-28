import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import './AIAssistant.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  skill?: string;
  timestamp: Date;
}

// ─── Static Data ──────────────────────────────────────────────────────────────

const HERO_CHIPS = [
  '🟢 وضع آمن',
  '📖 قراءة فقط',
  '🔒 بدون اتصال خارجي',
  '🧠 لا يوجد نموذج ذكاء اصطناعي بعد',
] as const;

const KPI_READY = [
  { icon: '🏦', label: 'تحليل كشف الحساب',   color: 'blue',  skill: 'Bank Statement Skill' },
  { icon: '💰', label: 'تحليل الرواتب',        color: 'green', skill: 'Payroll Skill'         },
  { icon: '📊', label: 'شرح التقارير',          color: 'amber', skill: 'Reports Skill'         },
  { icon: '💸', label: 'تحليل المصروفات',       color: 'red',   skill: 'Expense Skill'         },
] as const;

const KPI_SOON = [
  { icon: '📄', label: 'العقود'   },
  { icon: '👥', label: 'العملاء'  },
  { icon: '📑', label: 'OCR'      },
  { icon: '🔍', label: 'RAG'      },
  { icon: '🧠', label: 'Local AI' },
] as const;

const PROMPT_GROUPS = [
  {
    key: 'bank',
    label: 'كشوف البنك',
    icon: '🏦',
    skill: 'Bank Statement Skill',
    prompts: [
      'لخّص آخر كشف حساب مستورد',
      'اعرض أكبر عمليات السحب',
      'اعرض رسوم البنك',
      'اعرض العمليات ذات التنبيهات',
    ],
  },
  {
    key: 'payroll',
    label: 'الرواتب',
    icon: '💰',
    skill: 'Payroll Skill',
    prompts: [
      'لخّص آخر شهر',
      'أعلى الرواتب',
      'مقارنة آخر ٦ أشهر',
      'اكتشف الرواتب غير المعتادة',
    ],
  },
  {
    key: 'reports',
    label: 'التقارير',
    icon: '📊',
    skill: 'Reports Skill',
    prompts: [
      'اشرح تقرير الأرباح',
      'اشرح تقرير المصروفات',
      'قارن شهرين',
      'لخص التقرير الحالي',
    ],
  },
  {
    key: 'contracts',
    label: 'العقود',
    icon: '📄',
    skill: 'Contract Skill',
    prompts: [
      'العقود النشطة',
      'العقود القريبة من الانتهاء',
      'أكبر العملاء',
      'العقود الأعلى قيمة',
    ],
  },
] as const;

const SKILL_CARDS = [
  {
    id: 'bank-statement',
    icon: '🏦',
    iconColor: 'blue',
    nameEn: 'Bank Statement Skill',
    nameAr: 'مهارة كشف الحساب البنكي',
    desc: 'تلخيص الكشف، أكبر عمليات السحب والإيداع، رسوم البنك، التنبيهات والمخالفات',
    status: 'جاهز تجريبياً',
    statusCls: 'ready' as const,
    modules: ['كشف الحساب', 'المعاملات البنكية'],
    priority: 'عالية',
    priorityCls: 'high' as const,
  },
  {
    id: 'payroll',
    icon: '💰',
    iconColor: 'green',
    nameEn: 'Payroll Skill',
    nameAr: 'مهارة تحليل الرواتب',
    desc: 'ملخص الرواتب الشهري، أعلى الرواتب، تتبع التغييرات، اكتشاف الأنماط غير المعتادة',
    status: 'جاهز تجريبياً',
    statusCls: 'ready' as const,
    modules: ['الرواتب', 'الموظفون'],
    priority: 'عالية',
    priorityCls: 'high' as const,
  },
  {
    id: 'reports',
    icon: '📊',
    iconColor: 'amber',
    nameEn: 'Reports Skill',
    nameAr: 'مهارة شرح التقارير',
    desc: 'شرح نتائج التقارير بلغة بسيطة، مقارنة الفترات، توليد ملخصات تلقائية للأرقام الرئيسية',
    status: 'جاهز تجريبياً',
    statusCls: 'ready' as const,
    modules: ['التقارير', 'لوحة التحكم'],
    priority: 'عالية',
    priorityCls: 'high' as const,
  },
  {
    id: 'expenses',
    icon: '💸',
    iconColor: 'red',
    nameEn: 'Expense Skill',
    nameAr: 'مهارة تحليل المصروفات',
    desc: 'أكبر المصروفات، الاتجاهات الشهرية، تحديد المصروفات غير المعتادة، تركيز المورّدين',
    status: 'جاهز تجريبياً',
    statusCls: 'ready' as const,
    modules: ['المصروفات', 'الموردون'],
    priority: 'عالية',
    priorityCls: 'high' as const,
  },
  {
    id: 'contracts',
    icon: '📄',
    iconColor: 'gray',
    nameEn: 'Contract Skill',
    nameAr: 'مهارة تحليل العقود',
    desc: 'العقود النشطة والمنتهية قريباً، القيم الإجمالية، تحليل النشاط الأخير لكل عقد',
    status: 'قريباً',
    statusCls: 'soon' as const,
    modules: ['العقود', 'العملاء'],
    priority: 'متوسطة',
    priorityCls: 'med' as const,
  },
  {
    id: 'customers',
    icon: '👥',
    iconColor: 'gray',
    nameEn: 'Customer Skill',
    nameAr: 'مهارة تحليل العملاء',
    desc: 'أرصدة العملاء، سجل الفواتير، أنماط الدفع، العملاء المتأخرون عن السداد',
    status: 'قريباً',
    statusCls: 'soon' as const,
    modules: ['العملاء', 'الفواتير'],
    priority: 'متوسطة',
    priorityCls: 'med' as const,
  },
  {
    id: 'executive',
    icon: '📈',
    iconColor: 'gray',
    nameEn: 'Executive Insight Skill',
    nameAr: 'مهارة الرؤى التنفيذية',
    desc: 'شرح مؤشرات الأداء، أسباب الأرباح والخسائر، إبراز المخاطر والفرص الاستراتيجية',
    status: 'قريباً',
    statusCls: 'soon' as const,
    modules: ['لوحة التحكم', 'التقارير', 'العقود'],
    priority: 'متوسطة',
    priorityCls: 'med' as const,
  },
  {
    id: 'document-ai',
    icon: '📑',
    iconColor: 'gray',
    nameEn: 'Document AI Skill',
    nameAr: 'مهارة الذكاء الاصطناعي للوثائق',
    desc: 'OCR، استخراج البيانات الهيكلية من المستندات، التحقق من النتائج قبل الحفظ',
    status: 'مستقبلاً',
    statusCls: 'future' as const,
    modules: ['الفواتير', 'الموظفون', 'العقود'],
    priority: 'منخفضة',
    priorityCls: 'low' as const,
  },
] as const;

const SAFETY_ITEMS = [
  'قراءة فقط — لا يمكن تعديل أي بيانات',
  'لا حذف — لا يمكن حذف أي سجل',
  'لا ترحيل محاسبي — لا قيود آلية',
  'احترام الصلاحيات — يرث صلاحيات المستخدم',
  'لا اتصال خارجي — يعمل دون إنترنت',
  'جميع العمليات ستكون قابلة للتدقيق',
] as const;

const ARCH_NODES = [
  { label: 'AI Workspace',   type: 'primary-node' },
  { label: 'Orchestrator',   type: ''              },
  { label: 'Tool Layer',     type: ''              },
  { label: 'Safe SQL Layer', type: ''              },
  { label: 'ERP Data',       type: 'data-node'     },
  { label: 'Result',         type: 'result-node'   },
] as const;

const ROADMAP_ITEMS = [
  { phase: 'AI-1', name: 'UI Workspace',         desc: 'واجهة العمل الأساسية',           current: true  },
  { phase: 'AI-2', name: 'Safe Query Templates', desc: 'قوالب استعلام آمنة',             current: false },
  { phase: 'AI-3', name: 'SELECT-only SQL',       desc: 'طبقة SQL للقراءة فقط',           current: false },
  { phase: 'AI-4', name: 'Local LLM',             desc: 'نموذج ذكاء اصطناعي محلي',       current: false },
  { phase: 'AI-5', name: 'RAG',                   desc: 'استرجاع معزز من الوثائق',       current: false },
  { phase: 'AI-6', name: 'Document AI',           desc: 'الذكاء الاصطناعي للوثائق',      current: false },
  { phase: 'AI-7', name: 'Executive Insights',    desc: 'رؤى تنفيذية متقدمة',            current: false },
] as const;

const SOURCE_ITEMS = [
  { icon: '🏦', label: 'Bank Statement Explorer' },
  { icon: '💰', label: 'Payroll Analytics'       },
  { icon: '📊', label: 'Reports Center'          },
  { icon: '📄', label: 'Contracts'               },
  { icon: '👥', label: 'Customers'               },
  { icon: '💸', label: 'Expenses'                },
  { icon: '📈', label: 'Executive Dashboard'     },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectSkill(text: string): string {
  if (text.includes('كشف') || text.includes('بنك') || text.includes('سحب') || text.includes('رسوم') || text.includes('تنبيه')) {
    return 'Bank Statement Skill';
  }
  if (text.includes('راتب') || text.includes('رواتب') || text.includes('أشهر') || text.includes('اشهر') || text.includes('معتاد')) {
    return 'Payroll Skill';
  }
  if (text.includes('مصروف') || text.includes('مصاريف')) {
    return 'Expense Skill';
  }
  if (text.includes('عقد') || text.includes('عقود') || text.includes('عميل') || text.includes('عملاء') || text.includes('انتهاء')) {
    return 'Contract Skill';
  }
  if (text.includes('تقرير') || text.includes('أرباح') || text.includes('ارباح') || text.includes('خسائر') || text.includes('لخص')) {
    return 'Reports Skill';
  }
  return 'Reports Skill';
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' });
}

function buildResponse(query: string, skill: string): string {
  return `تم استلام طلبك.\n\nالطلب: "${query}"\n\nهذا النوع من التحليل سيتوفر في المراحل القادمة من المساعد الذكي.\n\nالمهارة المستقبلية: ${skill}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [openPanels, setOpenPanels] = useState<Set<string>>(
    new Set(['safety', 'arch', 'roadmap', 'sources']),
  );

  const conversationRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages]);

  const togglePanel = useCallback((key: string) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const skill = detectSkill(text);
    setMessages(prev => [
      ...prev,
      { id: `u-${Date.now()}`,   role: 'user',      text,                          timestamp: new Date() },
      { id: `a-${Date.now()+1}`, role: 'assistant', text: buildResponse(text, skill), skill, timestamp: new Date() },
    ]);
    setInput('');
    inputRef.current?.focus();
  }, [input]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handlePrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  const handleClear = useCallback(() => { setMessages([]); setInput(''); }, []);

  const hasMessages = useMemo(() => messages.length > 0, [messages.length]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="ai-page">

      {/* ── 1. Hero ── */}
      <section className="ai-hero">
        <div className="ai-hero-left">
          <div className="ai-hero-icon">🧠</div>
          <h1 className="ai-hero-title">المساعد الذكي</h1>
          <p className="ai-hero-subtitle">
            مساعد متخصص لتحليل بيانات النظام وشرح المؤشرات والتقارير مع الحفاظ على خصوصية البيانات وعدم تعديلها.
          </p>
          <div className="ai-hero-chips">
            {HERO_CHIPS.map(chip => (
              <span key={chip} className="ai-hero-chip">{chip}</span>
            ))}
          </div>
        </div>
        <div className="ai-hero-right">
          <div className="ai-hero-phase-badge">
            <span className="ai-phase-label">المرحلة الحالية</span>
            <span className="ai-phase-name">AI-1</span>
            <span className="ai-phase-sub">UI Foundation</span>
          </div>
        </div>
      </section>

      {/* ── 2. Capability Cards ── */}
      <section className="ai-kpi-section">
        <div className="ai-kpi-section-label">
          <span className="material-symbols-outlined">task_alt</span>
          جاهز تجريبياً
        </div>
        <div className="ai-kpi-grid">
          {KPI_READY.map(card => (
            <div key={card.label} className="ai-kpi-card clickable">
              <div className={`ai-kpi-icon ${card.color}`}>{card.icon}</div>
              <div className="ai-kpi-info">
                <div className="ai-kpi-label">{card.label}</div>
                <span className="ai-kpi-badge ready">● جاهز تجريبياً</span>
              </div>
            </div>
          ))}
        </div>
        <div className="ai-soon-row">
          <span className="ai-soon-row-label">قريباً:</span>
          {KPI_SOON.map(s => (
            <span key={s.label} className="ai-soon-chip">
              <span className="ai-soon-dot" />
              {s.icon} {s.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── 3. Main Workspace (2-col) ── */}
      <div className="ai-workspace-layout">

        {/* ── Left column: Prompts + Chat ── */}
        <div className="ai-workspace-main">

          {/* Suggested Prompts */}
          <div className="ai-panel">
            <div className="ai-panel-header">
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">auto_awesome</span>
                اقتراحات ذكية
              </div>
            </div>
            <div className="ai-panel-body">
              <div className="ai-prompts-grid">
                {PROMPT_GROUPS.map(group => (
                  <div key={group.key}>
                    <div className="ai-prompt-group-header">
                      <span className="ai-prompt-group-icon">{group.icon}</span>
                      <span className="ai-prompt-group-label">{group.label}</span>
                    </div>
                    <div className="ai-prompt-chips">
                      {group.prompts.map(p => (
                        <button
                          key={p}
                          type="button"
                          className="ai-prompt-chip"
                          onClick={() => handlePrompt(p)}
                        >
                          <span className="material-symbols-outlined">arrow_back_ios</span>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Chat Workspace */}
          <div className="ai-panel">
            <div className="ai-panel-header">
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">chat</span>
                مساحة العمل
              </div>
            </div>

            <div className="ai-chat-conversation" ref={conversationRef}>
              {!hasMessages ? (
                <div className="ai-chat-empty">
                  <div className="ai-chat-empty-icon">🧠</div>
                  <div className="ai-chat-empty-title">المساعد جاهز للاستخدام</div>
                  <div className="ai-chat-empty-desc">
                    اختر سؤالاً من الاقتراحات أعلاه أو اكتب طلبك في الحقل أدناه.
                  </div>
                  <div className="ai-chat-phase-note">
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>info</span>
                    المرحلة الأولى — واجهة عمل فقط
                  </div>
                </div>
              ) : (
                messages.map(msg => (
                  <div key={msg.id} className={`ai-message ${msg.role}`}>
                    <div className="ai-message-bubble">{msg.text}</div>
                    <div className="ai-message-meta">
                      <span className="ai-message-time">{formatTime(msg.timestamp)}</span>
                      {msg.role === 'assistant' && msg.skill && (
                        <span className="ai-message-skill">
                          <span className="material-symbols-outlined">psychology</span>
                          {msg.skill}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="ai-chat-input-row">
              <div className="ai-chat-input-wrap">
                <textarea
                  ref={inputRef}
                  className="ai-chat-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="اكتب طلبك هنا… (Enter للإرسال، Shift+Enter لسطر جديد)"
                  rows={2}
                />
              </div>
              <div className="ai-chat-btn-col">
                <button
                  type="button"
                  className="ai-chat-send"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  title="إرسال"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
                {hasMessages && (
                  <button
                    type="button"
                    className="ai-chat-clear-btn"
                    onClick={handleClear}
                    title="مسح المحادثة"
                  >
                    <span className="material-symbols-outlined">restart_alt</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: Panels ── */}
        <div className="ai-workspace-sidebar">

          {/* Safety Center */}
          <div className="ai-panel">
            <div
              className="ai-panel-header collapsible"
              onClick={() => togglePanel('safety')}
            >
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">verified_user</span>
                مركز السلامة
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('safety') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('safety') && (
              <div className="ai-panel-body">
                <div className="ai-safety-list">
                  {SAFETY_ITEMS.map((item, i) => (
                    <div key={i} className="ai-safety-item">
                      <div className="ai-safety-check">✓</div>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Architecture Panel */}
          <div className="ai-panel">
            <div
              className="ai-panel-header collapsible"
              onClick={() => togglePanel('arch')}
            >
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">device_hub</span>
                معمارية النظام
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('arch') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('arch') && (
              <div className="ai-panel-body">
                <div className="ai-arch-flow">
                  {ARCH_NODES.map((node, i) => (
                    <div key={node.label} style={{ width: '100%' }}>
                      <div className={`ai-arch-node ${node.type}`}>{node.label}</div>
                      {i < ARCH_NODES.length - 1 && (
                        <div className="ai-arch-arrow">↓</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="ai-arch-readonly">قراءة فقط — Read-Only</div>
              </div>
            )}
          </div>

          {/* Roadmap */}
          <div className="ai-panel">
            <div
              className="ai-panel-header collapsible"
              onClick={() => togglePanel('roadmap')}
            >
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">timeline</span>
                خطة التطوير
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('roadmap') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('roadmap') && (
              <div className="ai-panel-body">
                <div className="ai-roadmap-list">
                  {ROADMAP_ITEMS.map(item => (
                    <div key={item.phase} className="ai-roadmap-item">
                      <div className={`ai-roadmap-phase ${item.current ? 'current' : ''}`}>
                        {item.phase}
                      </div>
                      <div className="ai-roadmap-info">
                        <div className="ai-roadmap-name">{item.name}</div>
                        <div className="ai-roadmap-desc">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Source Preview */}
          <div className="ai-panel">
            <div
              className="ai-panel-header collapsible"
              onClick={() => togglePanel('sources')}
            >
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">database</span>
                مصادر البيانات
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('sources') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('sources') && (
              <div className="ai-panel-body">
                <p className="ai-sources-note">
                  ستظهر مصادر البيانات المستخدمة هنا في المراحل القادمة.
                </p>
                <div className="ai-sources-list">
                  {SOURCE_ITEMS.map(s => (
                    <div key={s.label} className="ai-sources-item">
                      <span className="ai-sources-dot" />
                      <span>{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. Capability Explorer ── */}
      <section>
        <div className="ai-skills-header">
          <div>
            <h2 className="ai-skills-title">مهارات المساعد المستقبلية</h2>
            <p className="ai-skills-subtitle">وصف شامل للقدرات التحليلية المخططة — قراءة فقط في المراحل الأولى</p>
          </div>
        </div>
        <div className="ai-skills-grid">
          {SKILL_CARDS.map(card => (
            <div
              key={card.id}
              className={`ai-skill-card ${card.statusCls === 'future' ? 'dimmed' : ''}`}
            >
              <div className="ai-skill-top">
                <div className={`ai-skill-icon-wrap ${card.iconColor}`}>{card.icon}</div>
                <span className={`ai-skill-status ${card.statusCls}`}>{card.status}</span>
              </div>
              <div className="ai-skill-body">
                <div className="ai-skill-en">{card.nameEn}</div>
                <div className="ai-skill-ar">{card.nameAr}</div>
                <div className="ai-skill-desc">{card.desc}</div>
                <div className="ai-skill-modules">
                  {card.modules.map(m => (
                    <span key={m} className="ai-skill-module">{m}</span>
                  ))}
                </div>
              </div>
              <div className="ai-skill-footer">
                <span className="ai-skill-priority">
                  <span className={`ai-priority-dot ${card.priorityCls}`} />
                  أولوية: {card.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
