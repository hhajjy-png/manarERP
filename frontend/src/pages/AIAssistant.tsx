import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AIAssistant.css';
import ResultCard from '../ai/ResultCard';
import { route } from '../ai/router';
import { executeSkill } from '../ai/registry';
import type { SkillResult, RouterDecision } from '../ai/types';
import { useToastStore } from '../stores/toastStore';
import { useT } from '../lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  skill?: string;
  result?: SkillResult;
  routerDecision?: RouterDecision;
  timestamp: Date;
}

interface SerializedMsg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  skill?: string;
  result?: SkillResult;
  routerDecision?: RouterDecision;
  timestamp: number;
}

interface AiConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: SerializedMsg[];
}

interface QuickAction {
  id: string;
  icon: string;
  label: string;
  type: 'prompt' | 'navigate' | 'soon';
  prompt: string;
  route: string;
  available: boolean;
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// ─── localStorage Keys ────────────────────────────────────────────────────────

const LS_HISTORY = 'ai_assistant_history_v1';
const LS_PINNED  = 'ai_assistant_pinned_prompts_v1';

// ─── Static Data (language-independent) ────────────────────────────────────────

// NOTE: The following literal Arabic phrases are intentionally left untouched.
// They are used both as visible chip/button text AND as the exact text sent to
// the deterministic Arabic-keyword NLU router (frontend/src/ai/router.ts) when
// clicked. Translating them would stop them from matching the router's Arabic
// keyword lists and would break the underlying skill (same reasoning as the
// `.prompt` fields on QUICK_ACTIONS / KPI cards / PROMPT_GROUPS below).
const SUGGESTED_EMPTY = [
  'لخّص آخر كشف حساب مستورد',
  'أعلى الرواتب هذا الشهر',
  'اشرح تقرير الأرباح',
] as const;

// Architecture node labels are already English by design (technical diagram).
const ARCH_NODES = [
  { label: 'AI Workspace',   type: 'primary-node' },
  { label: 'Orchestrator',   type: ''              },
  { label: 'Tool Layer',     type: ''              },
  { label: 'Safe SQL Layer', type: ''              },
  { label: 'ERP Data',       type: 'data-node'     },
  { label: 'Result',         type: 'result-node'   },
] as const;

// Source preview labels are already English by design (module/system names).
const SOURCE_ITEMS = [
  { icon: '🏦', label: 'Bank Statement Explorer' },
  { icon: '💰', label: 'Payroll Analytics'       },
  { icon: '📊', label: 'Reports Center'          },
  { icon: '📄', label: 'Contracts'               },
  { icon: '👥', label: 'Customers'               },
  { icon: '💸', label: 'Expenses'                },
  { icon: '📈', label: 'Executive Dashboard'     },
] as const;

// ─── localStorage Helpers ─────────────────────────────────────────────────────

function loadHistory(): AiConversation[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AiConversation[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(convs: AiConversation[]): void {
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(convs)); } catch { /* quota */ }
}

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_PINNED);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function savePinned(pins: Set<string>): void {
  try { localStorage.setItem(LS_PINNED, JSON.stringify([...pins])); } catch { /* quota */ }
}

function serializeMsgs(msgs: AiMessage[]): SerializedMsg[] {
  return msgs.map(m => {
    const s: SerializedMsg = { ...m, timestamp: m.timestamp.getTime() };
    if (s.result) {
      // Strip large optional arrays to keep localStorage compact
      const {
        highlights: _h, cards: _c,
        richSources: _rs, explanationSteps: _es,
        relatedSkills: _rsk, relatedPages: _rp,
        actions: _a, skillMetadata: _sm, diagnostics: _d,
        ...compact
      } = s.result;
      s.result = compact as SkillResult;
    }
    return s;
  });
}

function deserializeMsgs(msgs: SerializedMsg[]): AiMessage[] {
  return msgs.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function buildNoSkillResult(prompt: string, t: TFn): SkillResult {
  const now = Date.now();
  return {
    skillId: 'none',
    skillTitleAr: 'غير محدد',
    intent: 'unknown',
    prompt,
    title: t('ai.fallback.title'),
    summary: t('ai.fallback.summary'),
    statistics: [],
    warnings: [{ message: t('ai.fallback.warning'), severity: 'info' }],
    sources: [],
    suggestedQuestions: [
      t('ai.fallback.q1'),
      t('ai.fallback.q2'),
      t('ai.fallback.q3'),
      t('ai.fallback.q4'),
    ],
    isInsufficientData: true,
    executedAt: now,
    executionMs: 0,
  };
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('ar-KW', { month: 'short', day: 'numeric' });
}

function downloadTxt(content: string, filename: string): void {
  const blob = new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAssistant() {
  const navigate = useNavigate();
  const { t } = useT();

  // ── Static Data (language-dependent — built inside the component so labels
  //    translate; `.prompt` / `.prompts` fields stay Arabic — see scope note
  //    above and per-array comments) ─────────────────────────────────────────

  const HERO_CHIPS = [
    t('ai.hero.chip.safe'),
    t('ai.hero.chip.readonly'),
    t('ai.hero.chip.offline'),
    t('ai.hero.chip.experimental'),
  ];

  // `.prompt` is sent verbatim to the Arabic-keyword router when clicked — do not translate.
  const KPI_READY = [
    { icon: '🏦', label: t('ai.kpi.bank_statement'),        color: 'blue',  skill: 'Bank Statement Skill', prompt: 'لخّص آخر كشف حساب مستورد' },
    { icon: '💰', label: t('ai.kpi.payroll'),                color: 'green', skill: 'Payroll Skill',         prompt: 'لخّص آخر شهر' },
    { icon: '📊', label: t('ai.kpi.reports'),                color: 'amber', skill: 'Reports Skill',         prompt: 'لخص التقرير الحالي' },
    { icon: '💸', label: t('ai.action.expense_analysis'),    color: 'red',   skill: 'Expense Skill',         prompt: 'اعرض أكبر المصروفات الشهرية' },
  ];

  // «Coming soon» here means genuinely planned. Skills based on LLMs/OCR/RAG are
  // **out of the roadmap**, so they were removed: an advertised, unfunded promise
  // is worse than no promise at all.
  const KPI_SOON = [
    { icon: '👥', label: t('ai.common.customers') },
    { icon: '📈', label: t('ai.kpi.soon_executive_insights') },
  ];

  // `.prompt` is sent verbatim to the Arabic-keyword router when clicked — do not translate.
  const QUICK_ACTIONS: QuickAction[] = [
    { id: 'qa-bank',    icon: '🏦', label: t('ai.quick.bank'),                    type: 'prompt',   prompt: 'لخّص آخر كشف حساب مستورد',    route: '',                        available: true  },
    { id: 'qa-payroll', icon: '💰', label: t('ai.quick.payroll'),                 type: 'prompt',   prompt: 'لخّص آخر شهر',                route: '',                        available: true  },
    { id: 'qa-report',  icon: '📊', label: t('ai.quick.report'),                  type: 'prompt',   prompt: 'لخص التقرير الحالي',           route: '',                        available: true  },
    { id: 'qa-expense', icon: '💸', label: t('ai.action.expense_analysis'),       type: 'prompt',   prompt: 'اعرض أكبر المصروفات الشهرية', route: '',                        available: true  },
    { id: 'qa-alerts',  icon: '⚠️', label: t('ai.quick.alerts'),                  type: 'prompt',   prompt: 'اعرض العمليات ذات التنبيهات', route: '',                        available: true  },
    { id: 'qa-recon',   icon: '🔗', label: t('ai.quick.open_bank_explorer'),      type: 'navigate', prompt: '',                             route: '/bank-reconciliation',    available: true  },
    { id: 'qa-analyt',  icon: '📈', label: t('ai.quick.open_payroll_analytics'),  type: 'navigate', prompt: '',                             route: '/payroll/bank-analytics', available: true  },
    { id: 'qa-reports', icon: '📋', label: t('ai.quick.open_reports_center'),     type: 'navigate', prompt: '',                             route: '/reports',                available: true  },
  ];

  // `.prompts` entries are sent verbatim to the Arabic-keyword router when clicked — do not translate.
  const PROMPT_GROUPS = [
    {
      key: 'bank', label: t('ai.prompt.group_bank'), icon: '🏦', skill: 'Bank Statement Skill',
      prompts: ['لخّص آخر كشف حساب مستورد', 'اعرض أكبر عمليات السحب', 'اعرض رسوم البنك', 'اعرض العمليات ذات التنبيهات'],
    },
    {
      key: 'payroll', label: t('nav.salaries'), icon: '💰', skill: 'Payroll Skill',
      prompts: ['لخّص آخر شهر', 'أعلى الرواتب', 'مقارنة آخر ٦ أشهر', 'اكتشف الرواتب غير المعتادة'],
    },
    {
      key: 'reports', label: t('ai.common.reports'), icon: '📊', skill: 'Reports Skill',
      prompts: ['اشرح تقرير الأرباح', 'اشرح تقرير المصروفات', 'قارن شهرين', 'لخص التقرير الحالي'],
    },
    {
      key: 'contracts', label: t('ai.common.contracts'), icon: '📄', skill: 'Contract Skill',
      prompts: ['العقود النشطة', 'العقود القريبة من الانتهاء', 'أكبر العملاء', 'العقود الأعلى قيمة'],
    },
  ];

  const SKILL_CARDS = [
    { id: 'bank-statement', icon: '🏦', iconColor: 'blue',  nameEn: 'Bank Statement Skill',   nameAr: 'مهارة كشف الحساب البنكي', desc: t('ai.skills.desc.bank_statement'), status: t('ai.skills.status_ready'), statusCls: 'ready'  as const, modules: [t('nav.statements'), t('ai.common.bank_transactions')], priority: t('ai.skills.priority_high'), priorityCls: 'high' as const },
    { id: 'payroll',        icon: '💰', iconColor: 'green', nameEn: 'Payroll Skill',           nameAr: 'مهارة تحليل الرواتب',      desc: t('ai.skills.desc.payroll'),        status: t('ai.skills.status_ready'), statusCls: 'ready'  as const, modules: [t('nav.salaries'), t('ai.common.employees')],           priority: t('ai.skills.priority_high'), priorityCls: 'high' as const },
    { id: 'reports',        icon: '📊', iconColor: 'amber', nameEn: 'Reports Skill',           nameAr: 'مهارة شرح التقارير',       desc: t('ai.skills.desc.reports'),        status: t('ai.skills.status_ready'), statusCls: 'ready'  as const, modules: [t('ai.common.reports'), t('nav.dashboard')],            priority: t('ai.skills.priority_high'), priorityCls: 'high' as const },
    { id: 'expenses',       icon: '💸', iconColor: 'red',   nameEn: 'Expense Skill',           nameAr: 'مهارة تحليل المصروفات',    desc: t('ai.skills.desc.expenses'),       status: t('ai.skills.status_ready'), statusCls: 'ready'  as const, modules: [t('ai.common.expenses'), t('nav.suppliers')],           priority: t('ai.skills.priority_high'), priorityCls: 'high' as const },
    { id: 'contracts',      icon: '📄', iconColor: 'gray',  nameEn: 'Contract Skill',          nameAr: 'مهارة تحليل العقود',       desc: t('ai.skills.desc.contracts'),      status: t('ai.skills.status_ready'), statusCls: 'ready'  as const, modules: [t('ai.common.contracts'), t('ai.common.customers')],   priority: t('ai.skills.priority_med'),  priorityCls: 'med'  as const },
    { id: 'customers',      icon: '👥', iconColor: 'gray',  nameEn: 'Customer Skill',          nameAr: 'مهارة تحليل العملاء',      desc: t('ai.skills.desc.customers'),      status: t('ai.common.soon'),         statusCls: 'soon'   as const, modules: [t('ai.common.customers'), t('ai.common.invoices')],    priority: t('ai.skills.priority_med'),  priorityCls: 'med'  as const },
    { id: 'executive',      icon: '📈', iconColor: 'gray',  nameEn: 'Executive Insight Skill', nameAr: 'مهارة الرؤى التنفيذية',    desc: t('ai.skills.desc.executive'),      status: t('ai.common.soon'),         statusCls: 'soon'   as const, modules: [t('nav.dashboard'), t('ai.common.reports')],            priority: t('ai.skills.priority_med'),  priorityCls: 'med'  as const },
  ];

  const SAFETY_ITEMS = [
    t('ai.safety.item1'),
    t('ai.safety.item2'),
    t('ai.safety.item3'),
    t('ai.safety.item4'),
    t('ai.safety.item5'),
    t('ai.safety.item6'),
  ];

  // The assistant's roadmap as it actually stands. LLM/RAG/OCR phases (AI-3…AI-6)
  // were **removed from the roadmap**, so they must not be shown as upcoming:
  // displaying an unfunded phase makes the whole roadmap untrustworthy. The
  // assistant stays deterministic: no LLM, no free-form SQL, no OCR.
  const ROADMAP_ITEMS = [
    { phase: 'AI-1',   name: 'UI Workspace',              desc: t('ai.roadmap.desc1'), current: false },
    { phase: 'AI-1.5', name: 'Smart Workspace',           desc: t('ai.roadmap.desc2'), current: false },
    { phase: 'AI-2.5', name: 'Professional Skills Engine', desc: t('ai.roadmap.desc3'), current: true  },
    { phase: 'AI-3',   name: 'Executive Insights',        desc: t('ai.kpi.soon_executive_insights'), current: false },
  ];

  const WHATS_NEW_AVAILABLE = [
    t('ai.whatsnew.item1'),
    t('ai.whatsnew.item2'),
    t('ai.whatsnew.item3'),
    t('ai.whatsnew.item4'),
    t('ai.quick.section_label'),
    t('ai.whatsnew.item6'),
    t('ai.whatsnew.item7'),
    t('ai.whatsnew.item8'),
    t('ai.whatsnew.item9'),
    t('ai.whatsnew.item10'),
    t('ai.whatsnew.item11'),
  ];

  const WHATS_NEW_SOON = [
    t('ai.whatsnew.soon1'),
    t('ai.whatsnew.soon2'),
  ];

  // ── State ──────────────────────────────────────────────────────────────────
  const [input,         setInput]         = useState('');
  const [messages,      setMessages]      = useState<AiMessage[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>(() => loadHistory());
  const [pinnedPrompts, setPinnedPrompts] = useState<Set<string>>(() => loadPinned());
  const [openPanels,    setOpenPanels]    = useState<Set<string>>(
    new Set(['history', 'whats-new', 'safety', 'arch', 'roadmap', 'sources']),
  );
  const [sending,       setSending]       = useState(false);
  const [renamingId,    setRenamingId]    = useState<string | null>(null);
  const [renameText,    setRenameText]    = useState('');
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [lastDecision,  setLastDecision]  = useState<RouterDecision | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const conversationRef  = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const currentConvIdRef = useRef<string | null>(null);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Auto-save to history after every assistant reply
  useEffect(() => {
    if (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') return;
    let convId = currentConvIdRef.current;
    if (!convId) {
      convId = `conv-${Date.now()}`;
      currentConvIdRef.current = convId;
      setCurrentConvId(convId);
    }
    const title = (messages.find(m => m.role === 'user')?.text ?? t('ai.chat.new_conversation')).slice(0, 45);
    const now = Date.now();
    const serialized = serializeMsgs(messages);
    const cid = convId;
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === cid);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], messages: serialized, updatedAt: now };
        return updated;
      }
      return [{ id: cid, title, createdAt: now, updatedAt: now, messages: serialized }, ...prev];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => { saveHistory(conversations); }, [conversations]);
  useEffect(() => { savePinned(pinnedPrompts); },  [pinnedPrompts]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const sessionStats = useMemo(() => ({
    msgCount:     messages.length,
    lastSkill:    messages.filter(m => m.role === 'assistant' && m.skill).at(-1)?.skill ?? null,
    lastQuestion: messages.filter(m => m.role === 'user').at(-1)?.text?.slice(0, 32) ?? null,
    savedCount:   conversations.length,
  }), [messages, conversations.length]);

  const pinnedList = useMemo(() => [...pinnedPrompts], [pinnedPrompts]);
  const hasMessages = messages.length > 0;

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Shared toast mechanism (stores/toastStore.ts + Toast.tsx, mounted once in
  // Layout.tsx) instead of a page-local single-slot toast.
  const addToast = useToastStore((s) => s.add);
  const showToast = useCallback((text: string) => {
    addToast(text, 'ok');
  }, [addToast]);

  // Core send logic shared by handleSend + quick actions
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;
    const userMsg: AiMessage = { id: `u-${Date.now()}`, role: 'user', text, timestamp: new Date() };
    setInput('');
    setSending(true);
    setMessages(prev => [...prev, userMsg]);

    const decision = route(text);
    setLastDecision(decision);

    let result: SkillResult;
    if (decision.blocked) {
      // Informational blocked card — not an error
      const now = Date.now();
      result = {
        skillId: 'blocked', skillTitleAr: t('ai.blocked.skill_title'), intent: 'blocked', prompt: text,
        title: t('ai.blocked.title'),
        summary: decision.blockedMessage ?? t('ai.blocked.summary_fallback'),
        statistics: [],
        warnings: [{ message: t('ai.blocked.warning'), severity: 'info' }],
        sources: [{ icon: '🏦', labelAr: t('ai.blocked.source_label'), routePath: '/bank-reconciliation' }],
        suggestedQuestions: [t('ai.blocked.q1'), t('ai.blocked.q2'), t('ai.blocked.q3')],
        executedAt: now, executionMs: 0,
      };
    } else if (decision.skillId) {
      result = await executeSkill(decision.skillId, text, decision.intent);
    } else {
      result = buildNoSkillResult(text, t);
    }

    const assistantMsg: AiMessage = {
      id:             `a-${Date.now() + 1}`,
      role:           'assistant',
      text:           result.summary,
      skill:          result.skillTitleAr,
      result,
      routerDecision: decision,
      timestamp:      new Date(),
    };
    setMessages(prev => [...prev, assistantMsg]);
    setSending(false);
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending, t]);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const togglePanel = useCallback((key: string) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handleSend   = useCallback(() => { sendMessage(input.trim()); }, [input, sendMessage]);
  const handleKey    = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handlePrompt = useCallback((prompt: string) => {
    setInput(prompt);
    inputRef.current?.focus();
  }, []);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setInput('');
    currentConvIdRef.current = null;
    setCurrentConvId(null);
  }, []);

  const handleLoadConversation = useCallback((id: string) => {
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    setMessages(deserializeMsgs(conv.messages));
    currentConvIdRef.current = id;
    setCurrentConvId(id);
    setInput('');
  }, [conversations]);

  const handleDeleteConversation = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConvIdRef.current === id) startNewConversation();
  }, [startNewConversation]);

  const handleClearAllHistory = useCallback(() => {
    setConversations([]);
    startNewConversation();
    showToast(t('ai.toast.history_cleared'));
  }, [startNewConversation, showToast, t]);

  const handleStartRename = useCallback((id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(id);
    setRenameText(title);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (!renamingId) { setRenamingId(null); return; }
    const trimmed = renameText.trim();
    if (trimmed) setConversations(prev => prev.map(c => c.id === renamingId ? { ...c, title: trimmed } : c));
    setRenamingId(null);
  }, [renamingId, renameText]);

  const handlePinToggle = useCallback((prompt: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(prompt)) { next.delete(prompt); showToast(t('ai.toast.unpinned')); }
      else                   { next.add(prompt);    showToast(t('ai.toast.pinned')); }
      return next;
    });
  }, [showToast, t]);

  const handleCopyMessage = useCallback((text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(t('ai.toast.copied')))
        .catch(() => showToast(t('ai.toast.copy_failed')));
    } else {
      showToast(t('ai.toast.copy_unavailable'));
    }
  }, [showToast, t]);

  const handleCopyMarkdown = useCallback((text: string) => {
    const md = '> ' + text.replace(/\n/g, '\n> ');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(md).then(() => showToast(t('ai.toast.markdown_copied')));
    }
  }, [showToast, t]);

  const handleExportTxt = useCallback(() => {
    if (!messages.length) return;
    const lines = messages.map(m =>
      `[${m.role === 'user' ? t('ai.export.role_user') : t('ai.export.role_assistant')}] ${formatTime(m.timestamp)}\n${m.text}`
    );
    const content =
      `${t('ai.export.header')}\n${t('ai.export.date_label')} ${new Date().toLocaleDateString('ar-KW')}\n\n` +
      lines.join('\n\n---\n\n');
    downloadTxt(content, `ai-assistant-${Date.now()}.txt`);
    showToast(t('ai.toast.exported'));
  }, [messages, showToast, t]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    if (!action.available) { showToast(t('ai.toast.action_soon')); return; }
    if (action.type === 'navigate') { navigate(action.route); }
    else if (action.type === 'prompt' && action.prompt) { sendMessage(action.prompt); }
  }, [navigate, sendMessage, showToast, t]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="ai-page">

      {/* Toast rendering is now handled globally by the shared Toast component
          (mounted once in Layout.tsx) — no page-local toast markup needed. */}

      {/* ── 1. Hero ── */}
      <section className="ai-hero">
        <div className="ai-hero-left">
          <div className="ai-hero-icon">🧠</div>
          <h1 className="ai-hero-title">{t('nav.ai_assistant')}</h1>
          <p className="ai-hero-subtitle">
            {t('ai.hero.subtitle')}
          </p>
          <div className="ai-hero-chips">
            {HERO_CHIPS.map(chip => (
              <span key={chip} className="ai-hero-chip">{chip}</span>
            ))}
          </div>
        </div>
        <div className="ai-hero-right">
          <div className="ai-hero-phase-badge">
            <span className="ai-phase-label">{t('ai.hero.phase_label')}</span>
            <span className="ai-phase-name">AI-2</span>
            <span className="ai-phase-sub">Safe Intelligence Engine</span>
          </div>
        </div>
      </section>

      {/* ── 2. Recent Activity Row (Package E) ── */}
      <div className="ai-activity-row">
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">chat_bubble</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">{t('ai.activity.messages')}</div>
            <div className="ai-activity-value">{sessionStats.msgCount}</div>
          </div>
        </div>
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">psychology</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">{t('ai.activity.last_skill')}</div>
            <div className="ai-activity-value ai-activity-trunc">
              {sessionStats.lastSkill ?? '—'}
            </div>
          </div>
        </div>
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">help_outline</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">{t('ai.activity.last_question')}</div>
            <div className="ai-activity-value ai-activity-trunc">
              {sessionStats.lastQuestion ?? '—'}
            </div>
          </div>
        </div>
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">history</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">{t('ai.activity.saved_conversations')}</div>
            <div className="ai-activity-value">{sessionStats.savedCount}</div>
          </div>
        </div>
      </div>

      {/* ── 3. Capability Cards ── */}
      <section className="ai-kpi-section">
        <div className="ai-kpi-section-label">
          <span className="material-symbols-outlined">task_alt</span>
          {t('ai.kpi.section_label')}
        </div>
        <div className="ai-kpi-grid">
          {KPI_READY.map(card => (
            <div
              key={card.label}
              className="ai-kpi-card clickable"
              onClick={() => sendMessage(card.prompt)}
            >
              <div className={`ai-kpi-icon ${card.color}`}>{card.icon}</div>
              <div className="ai-kpi-info">
                <div className="ai-kpi-label">{card.label}</div>
                <span className="ai-kpi-badge ready">● {t('ai.skills.status_ready')}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="ai-soon-row">
          <span className="ai-soon-row-label">{t('ai.kpi.soon_label')}</span>
          {KPI_SOON.map(s => (
            <span key={s.label} className="ai-soon-chip">
              <span className="ai-soon-dot" />
              {s.icon} {s.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── 4. Quick Actions (Package C) ── */}
      <section>
        <div className="ai-section-label">
          <span className="material-symbols-outlined">bolt</span>
          {t('ai.quick.section_label')}
        </div>
        <div className="ai-quick-grid">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.id}
              type="button"
              className={`ai-quick-card ${!action.available ? 'soon' : ''} ${action.type === 'navigate' ? 'nav' : ''}`}
              onClick={() => handleQuickAction(action)}
              title={!action.available ? t('ai.common.soon') : action.label}
            >
              <span className="ai-quick-icon">{action.icon}</span>
              <span className="ai-quick-label">{action.label}</span>
              {!action.available && <span className="ai-quick-badge">{t('ai.common.soon')}</span>}
              {action.type === 'navigate' && action.available && (
                <span className="material-symbols-outlined ai-quick-nav-icon">open_in_new</span>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* ── 5. Main Workspace (2-col) ── */}
      <div className="ai-workspace-layout">

        {/* ── Left column ── */}
        <div className="ai-workspace-main">

          {/* Pinned Prompts (Package B) — only when non-empty */}
          {pinnedList.length > 0 && (
            <div className="ai-panel">
              <div className="ai-panel-header">
                <div className="ai-panel-title">
                  <span className="material-symbols-outlined">star</span>
                  {t('ai.prompt.pinned_title')}
                </div>
                <span className="ai-panel-badge">{pinnedList.length}</span>
              </div>
              <div className="ai-panel-body">
                <div className="ai-prompt-chips">
                  {pinnedList.map(p => (
                    <div key={p} className="ai-prompt-row">
                      <button type="button" className="ai-prompt-chip" onClick={() => handlePrompt(p)}>
                        <span className="material-symbols-outlined">arrow_back_ios</span>
                        {p}
                      </button>
                      <button
                        type="button"
                        className="ai-pin-btn pinned"
                        onClick={e => handlePinToggle(p, e)}
                        title={t('ai.prompt.unpin')}
                      >
                        <span className="material-symbols-outlined">star</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Suggested Prompts with star buttons (Package B) */}
          <div className="ai-panel">
            <div className="ai-panel-header">
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">auto_awesome</span>
                {t('ai.prompt.smart_title')}
              </div>
              <span className="ai-panel-hint">{t('ai.prompt.hint')}</span>
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
                        <div key={p} className="ai-prompt-row">
                          <button type="button" className="ai-prompt-chip" onClick={() => handlePrompt(p)}>
                            <span className="material-symbols-outlined">arrow_back_ios</span>
                            {p}
                          </button>
                          <button
                            type="button"
                            className={`ai-pin-btn ${pinnedPrompts.has(p) ? 'pinned' : ''}`}
                            onClick={e => handlePinToggle(p, e)}
                            title={pinnedPrompts.has(p) ? t('ai.prompt.unpin') : t('ai.prompt.pin')}
                          >
                            <span className="material-symbols-outlined">
                              {pinnedPrompts.has(p) ? 'star' : 'star_border'}
                            </span>
                          </button>
                        </div>
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
                {t('ai.chat.workspace_title')}
              </div>
              <div className="ai-chat-header-actions">
                {hasMessages && (
                  <button type="button" className="ai-chat-action-btn" onClick={handleExportTxt} title={t('ai.chat.export_title')}>
                    <span className="material-symbols-outlined">download</span>
                  </button>
                )}
                <button type="button" className="ai-chat-action-btn" onClick={startNewConversation} title={t('ai.chat.new_conversation')}>
                  <span className="material-symbols-outlined">add_comment</span>
                </button>
              </div>
            </div>

            <div className="ai-chat-conversation" ref={conversationRef}>
              {!hasMessages && !sending ? (
                /* Enhanced Empty State (Package G) */
                <div className="ai-chat-empty">
                  <div className="ai-chat-empty-icon">🧠</div>
                  <div className="ai-chat-empty-title">{t('ai.chat.empty_title')}</div>
                  <div className="ai-chat-empty-desc">
                    {t('ai.chat.empty_desc')}
                  </div>
                  <div className="ai-chat-empty-prompts">
                    {SUGGESTED_EMPTY.map(p => (
                      <button key={p} type="button" className="ai-chat-empty-prompt" onClick={() => handlePrompt(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <div className="ai-chat-phase-note">
                    <span className="material-symbols-outlined ai-phase-note-icon">shield</span>
                    {t('ai.chat.phase_note')}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map(msg => (
                    <div key={msg.id} className={`ai-message ${msg.role}`}>
                      <div className="ai-message-bubble">
                        {msg.result
                          ? <ResultCard result={msg.result} onFollowUp={handlePrompt} routerDecision={msg.routerDecision} />
                          : msg.text
                        }
                      </div>
                      <div className="ai-message-meta">
                        <span className="ai-message-time">{formatTime(msg.timestamp)}</span>
                        {msg.role === 'assistant' && msg.skill && !msg.result && (
                          <span className="ai-message-skill">
                            <span className="material-symbols-outlined">psychology</span>
                            {msg.skill}
                          </span>
                        )}
                        {msg.role === 'assistant' && (
                          <div className="ai-msg-actions">
                            <button
                              type="button"
                              className="ai-msg-action-btn"
                              onClick={() => handleCopyMessage(msg.text)}
                              title={t('ai.chat.copy')}
                            >
                              <span className="material-symbols-outlined">content_copy</span>
                            </button>
                            <button
                              type="button"
                              className="ai-msg-action-btn"
                              onClick={() => handleCopyMarkdown(msg.text)}
                              title={t('ai.chat.copy_markdown')}
                            >
                              <span className="material-symbols-outlined">code</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Thinking animation (Package H) */}
                  {sending && (
                    <div className="ai-message assistant">
                      <div className="ai-message-bubble ai-thinking">
                        <span className="ai-dot" />
                        <span className="ai-dot" />
                        <span className="ai-dot" />
                      </div>
                    </div>
                  )}
                </>
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
                  placeholder={t('ai.chat.input_placeholder')}
                  rows={2}
                  disabled={sending}
                />
              </div>
              <div className="ai-chat-btn-col">
                <button
                  type="button"
                  className={`ai-chat-send ${sending ? 'sending' : ''}`}
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  title={t('ai.chat.send')}
                >
                  <span className="material-symbols-outlined">
                    {sending ? 'hourglass_top' : 'send'}
                  </span>
                </button>
                {hasMessages && (
                  <button type="button" className="ai-chat-clear-btn" onClick={startNewConversation} title={t('ai.chat.new_conversation')}>
                    <span className="material-symbols-outlined">restart_alt</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: Panels ── */}
        <div className="ai-workspace-sidebar">

          {/* History Panel (Package A) */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('history')}>
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">history</span>
                {t('ai.history.title')}
                {conversations.length > 0 && (
                  <span className="ai-panel-badge">{conversations.length}</span>
                )}
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('history') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('history') && (
              <div className="ai-panel-body ai-history-body">
                <div className="ai-history-toolbar">
                  <button type="button" className="ai-history-action-btn" onClick={startNewConversation}>
                    <span className="material-symbols-outlined">add</span>
                    {t('ai.history.new')}
                  </button>
                  {conversations.length > 0 && (
                    <button type="button" className="ai-history-action-btn danger" onClick={handleClearAllHistory}>
                      <span className="material-symbols-outlined">delete_sweep</span>
                      {t('ai.history.clear_all')}
                    </button>
                  )}
                </div>
                {conversations.length === 0 ? (
                  <div className="ai-history-empty">{t('ai.history.empty')}</div>
                ) : (
                  <div className="ai-history-list">
                    {conversations.map(conv => (
                      <div
                        key={conv.id}
                        className={`ai-history-item ${currentConvId === conv.id ? 'active' : ''}`}
                        onClick={() => handleLoadConversation(conv.id)}
                      >
                        {renamingId === conv.id ? (
                          <input
                            autoFocus
                            className="ai-history-rename-input"
                            placeholder={t('ai.history.rename_placeholder')}
                            title={t('ai.history.rename_placeholder')}
                            value={renameText}
                            onChange={e => setRenameText(e.target.value)}
                            onBlur={handleConfirmRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  handleConfirmRename();
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <>
                            <div className="ai-history-item-info">
                              <div className="ai-history-title">{conv.title}</div>
                              <div className="ai-history-date">{formatDate(conv.updatedAt)}</div>
                            </div>
                            <div className="ai-history-item-btns">
                              <button
                                type="button"
                                className="ai-history-btn"
                                onClick={e => handleStartRename(conv.id, conv.title, e)}
                                title={t('ai.history.edit_title')}
                              >
                                <span className="material-symbols-outlined">edit</span>
                              </button>
                              <button
                                type="button"
                                className="ai-history-btn danger"
                                onClick={e => handleDeleteConversation(conv.id, e)}
                                title={t('action.delete')}
                              >
                                <span className="material-symbols-outlined">delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* What's New Panel (Package F) */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('whats-new')}>
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">new_releases</span>
                {t('ai.whatsnew.title')}
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('whats-new') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('whats-new') && (
              <div className="ai-panel-body">
                <div className="ai-whatsnew-group">
                  <div className="ai-whatsnew-heading available">
                    <span className="material-symbols-outlined">check_circle</span>
                    {t('ai.whatsnew.available_heading')}
                  </div>
                  {WHATS_NEW_AVAILABLE.map(item => (
                    <div key={item} className="ai-whatsnew-item available">{item}</div>
                  ))}
                </div>
                <div className="ai-whatsnew-group">
                  <div className="ai-whatsnew-heading soon">
                    <span className="material-symbols-outlined">schedule</span>
                    {t('ai.common.soon')}
                  </div>
                  {WHATS_NEW_SOON.map(item => (
                    <div key={item} className="ai-whatsnew-item soon">{item}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Safety Center (Package I — enhanced) */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('safety')}>
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">verified_user</span>
                {t('ai.safety.title')}
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('safety') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('safety') && (
              <div className="ai-panel-body">
                <div className="ai-safety-warning">
                  <span className="material-symbols-outlined">warning</span>
                  {t('ai.safety.warning')}
                </div>
                <div className="ai-safety-list">
                  {SAFETY_ITEMS.map((item, i) => (
                    <div key={i} className="ai-safety-item">
                      <div className="ai-safety-check">✓</div>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="ai-safety-footer">
                  <span className="material-symbols-outlined">lock</span>
                  {t('ai.safety.footer')}
                </div>
              </div>
            )}
          </div>

          {/* Architecture Panel */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('arch')}>
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">device_hub</span>
                {t('ai.arch.title')}
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('arch') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('arch') && (
              <div className="ai-panel-body">
                <div className="ai-arch-flow">
                  {ARCH_NODES.map((node, i) => (
                    <div key={node.label} className="ai-arch-node-wrap">
                      <div className={`ai-arch-node ${node.type}`}>{node.label}</div>
                      {i < ARCH_NODES.length - 1 && <div className="ai-arch-arrow">↓</div>}
                    </div>
                  ))}
                </div>
                <div className="ai-arch-readonly">{t('ai.arch.readonly')}</div>
              </div>
            )}
          </div>

          {/* Roadmap */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('roadmap')}>
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">timeline</span>
                {t('ai.roadmap.title')}
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
                      <div className={`ai-roadmap-phase ${item.current ? 'current' : ''}`}>{item.phase}</div>
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

          {/* Dev: Router Decision Panel — DEV only */}
          {import.meta.env.DEV && lastDecision && (
            <div className="ai-panel ai-dev-router-panel">
              <div className="ai-panel-header">
                <div className="ai-panel-title ai-dev-router-title">🔧 Router Decision</div>
              </div>
              <div className="ai-panel-body ai-dev-router-body">
                <div><b>Skill:</b> {lastDecision.skillId ?? 'none'}</div>
                <div><b>Intent:</b> {lastDecision.intent}</div>
                <div><b>Confidence:</b> {lastDecision.confidence}</div>
                <div><b>Fallback:</b> {String(lastDecision.fallback)}</div>
                <div><b>Keywords:</b> {lastDecision.matchedKeywords.join(', ') || '—'}</div>
              </div>
            </div>
          )}

          {/* Source Preview */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('sources')}>
              <div className="ai-panel-title">
                <span className="material-symbols-outlined">database</span>
                {t('ai.sources.title')}
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('sources') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('sources') && (
              <div className="ai-panel-body">
                <p className="ai-sources-note">{t('ai.sources.note')}</p>
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

      {/* ── 6. Capability Explorer ── */}
      <section>
        <div className="ai-skills-header">
          <div>
            <h2 className="ai-skills-title">{t('ai.skills.section_title')}</h2>
            <p className="ai-skills-subtitle">{t('ai.skills.section_subtitle')}</p>
          </div>
        </div>
        <div className="ai-skills-grid">
          {SKILL_CARDS.map(card => (
            // There is no longer a `future`-status card (that was the docs/OCR skill,
            // which has been removed from the roadmap).
            <div key={card.id} className="ai-skill-card">
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
                  {t('ai.skills.priority_label')} {card.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
