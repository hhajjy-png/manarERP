import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AIAssistant.css';
import ResultCard from '../ai/ResultCard';
import { route } from '../ai/router';
import { executeSkill } from '../ai/registry';
import type { SkillResult, RouterDecision } from '../ai/types';

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

// ─── localStorage Keys ────────────────────────────────────────────────────────

const LS_HISTORY = 'ai_assistant_history_v1';
const LS_PINNED  = 'ai_assistant_pinned_prompts_v1';

// ─── Static Data ──────────────────────────────────────────────────────────────

const HERO_CHIPS = [
  '🟢 وضع آمن',
  '📖 قراءة فقط',
  '🔒 بدون اتصال خارجي',
  '🧠 واجهة تجريبية',
] as const;

const KPI_READY = [
  { icon: '🏦', label: 'تحليل كشف الحساب',  color: 'blue',  skill: 'Bank Statement Skill', prompt: 'لخّص آخر كشف حساب مستورد' },
  { icon: '💰', label: 'تحليل الرواتب',       color: 'green', skill: 'Payroll Skill',         prompt: 'لخّص آخر شهر' },
  { icon: '📊', label: 'شرح التقارير',         color: 'amber', skill: 'Reports Skill',         prompt: 'لخص التقرير الحالي' },
  { icon: '💸', label: 'تحليل المصروفات',      color: 'red',   skill: 'Expense Skill',         prompt: 'اعرض أكبر المصروفات الشهرية' },
] as const;

const KPI_SOON = [
  { icon: '📄', label: 'العقود'   },
  { icon: '👥', label: 'العملاء'  },
  { icon: '📑', label: 'OCR'      },
  { icon: '🔍', label: 'RAG'      },
  { icon: '🧠', label: 'Local AI' },
] as const;

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'qa-bank',    icon: '🏦', label: 'تحليل آخر كشف بنك',       type: 'prompt',   prompt: 'لخّص آخر كشف حساب مستورد',    route: '',                        available: true  },
  { id: 'qa-payroll', icon: '💰', label: 'تلخيص الرواتب',            type: 'prompt',   prompt: 'لخّص آخر شهر',                route: '',                        available: true  },
  { id: 'qa-report',  icon: '📊', label: 'شرح آخر تقرير',             type: 'prompt',   prompt: 'لخص التقرير الحالي',           route: '',                        available: true  },
  { id: 'qa-expense', icon: '💸', label: 'تحليل المصروفات',           type: 'prompt',   prompt: 'اعرض أكبر المصروفات الشهرية', route: '',                        available: true  },
  { id: 'qa-alerts',  icon: '⚠️', label: 'عرض تنبيهات الجودة',        type: 'prompt',   prompt: 'اعرض العمليات ذات التنبيهات', route: '',                        available: true  },
  { id: 'qa-recon',   icon: '🔗', label: 'فتح مستكشف كشف الحساب',    type: 'navigate', prompt: '',                             route: '/bank-reconciliation',    available: true  },
  { id: 'qa-analyt',  icon: '📈', label: 'فتح تحليلات الرواتب',       type: 'navigate', prompt: '',                             route: '/payroll/bank-analytics', available: true  },
  { id: 'qa-reports', icon: '📋', label: 'فتح مركز التقارير',         type: 'navigate', prompt: '',                             route: '/reports',                available: true  },
  { id: 'qa-rag',     icon: '🔍', label: 'بحث ذكي في المستندات',       type: 'soon',     prompt: '',                             route: '',                        available: false },
  { id: 'qa-ocr',     icon: '📑', label: 'استخراج نص OCR',            type: 'soon',     prompt: '',                             route: '',                        available: false },
];

const PROMPT_GROUPS = [
  {
    key: 'bank', label: 'كشوف البنك', icon: '🏦', skill: 'Bank Statement Skill',
    prompts: ['لخّص آخر كشف حساب مستورد', 'اعرض أكبر عمليات السحب', 'اعرض رسوم البنك', 'اعرض العمليات ذات التنبيهات'],
  },
  {
    key: 'payroll', label: 'الرواتب', icon: '💰', skill: 'Payroll Skill',
    prompts: ['لخّص آخر شهر', 'أعلى الرواتب', 'مقارنة آخر ٦ أشهر', 'اكتشف الرواتب غير المعتادة'],
  },
  {
    key: 'reports', label: 'التقارير', icon: '📊', skill: 'Reports Skill',
    prompts: ['اشرح تقرير الأرباح', 'اشرح تقرير المصروفات', 'قارن شهرين', 'لخص التقرير الحالي'],
  },
  {
    key: 'contracts', label: 'العقود', icon: '📄', skill: 'Contract Skill',
    prompts: ['العقود النشطة', 'العقود القريبة من الانتهاء', 'أكبر العملاء', 'العقود الأعلى قيمة'],
  },
] as const;

const SKILL_CARDS = [
  { id: 'bank-statement', icon: '🏦', iconColor: 'blue',  nameEn: 'Bank Statement Skill',         nameAr: 'مهارة كشف الحساب البنكي',             desc: 'تلخيص الكشف، أكبر عمليات السحب والإيداع، رسوم البنك، التنبيهات والمخالفات',                          status: 'جاهز تجريبياً', statusCls: 'ready'  as const, modules: ['كشف الحساب', 'المعاملات البنكية'], priority: 'عالية', priorityCls: 'high' as const },
  { id: 'payroll',        icon: '💰', iconColor: 'green', nameEn: 'Payroll Skill',                 nameAr: 'مهارة تحليل الرواتب',                 desc: 'ملخص الرواتب الشهري، أعلى الرواتب، تتبع التغييرات، اكتشاف الأنماط غير المعتادة',                   status: 'جاهز تجريبياً', statusCls: 'ready'  as const, modules: ['الرواتب', 'الموظفون'],           priority: 'عالية', priorityCls: 'high' as const },
  { id: 'reports',        icon: '📊', iconColor: 'amber', nameEn: 'Reports Skill',                 nameAr: 'مهارة شرح التقارير',                  desc: 'شرح نتائج التقارير بلغة بسيطة، مقارنة الفترات، توليد ملخصات تلقائية للأرقام الرئيسية',              status: 'جاهز تجريبياً', statusCls: 'ready'  as const, modules: ['التقارير', 'لوحة التحكم'],        priority: 'عالية', priorityCls: 'high' as const },
  { id: 'expenses',       icon: '💸', iconColor: 'red',   nameEn: 'Expense Skill',                 nameAr: 'مهارة تحليل المصروفات',               desc: 'أكبر المصروفات، الاتجاهات الشهرية، تحديد المصروفات غير المعتادة، تركيز المورّدين',                   status: 'جاهز تجريبياً', statusCls: 'ready'  as const, modules: ['المصروفات', 'الموردون'],         priority: 'عالية', priorityCls: 'high' as const },
  { id: 'contracts',      icon: '📄', iconColor: 'gray',  nameEn: 'Contract Skill',                nameAr: 'مهارة تحليل العقود',                  desc: 'العقود النشطة والمنتهية قريباً، القيم الإجمالية، تحليل النشاط الأخير لكل عقد',                       status: 'قريباً',         statusCls: 'soon'   as const, modules: ['العقود', 'العملاء'],              priority: 'متوسطة', priorityCls: 'med'  as const },
  { id: 'customers',      icon: '👥', iconColor: 'gray',  nameEn: 'Customer Skill',                nameAr: 'مهارة تحليل العملاء',                 desc: 'أرصدة العملاء، سجل الفواتير، أنماط الدفع، العملاء المتأخرون عن السداد',                              status: 'قريباً',         statusCls: 'soon'   as const, modules: ['العملاء', 'الفواتير'],            priority: 'متوسطة', priorityCls: 'med'  as const },
  { id: 'executive',      icon: '📈', iconColor: 'gray',  nameEn: 'Executive Insight Skill',       nameAr: 'مهارة الرؤى التنفيذية',               desc: 'شرح مؤشرات الأداء، أسباب الأرباح والخسائر، إبراز المخاطر والفرص الاستراتيجية',                       status: 'قريباً',         statusCls: 'soon'   as const, modules: ['لوحة التحكم', 'التقارير'],        priority: 'متوسطة', priorityCls: 'med'  as const },
  { id: 'document-ai',    icon: '📑', iconColor: 'gray',  nameEn: 'Document AI Skill',             nameAr: 'مهارة الذكاء الاصطناعي للوثائق',      desc: 'OCR، استخراج البيانات الهيكلية من المستندات، التحقق من النتائج قبل الحفظ',                             status: 'مستقبلاً',       statusCls: 'future' as const, modules: ['الفواتير', 'العقود'],             priority: 'منخفضة', priorityCls: 'low'  as const },
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
  { phase: 'AI-1',   name: 'UI Workspace',              desc: 'واجهة العمل الأساسية',                    current: false },
  { phase: 'AI-1.5', name: 'Smart Workspace',           desc: 'سجل، مثبتات، إجراءات سريعة',             current: false },
  { phase: 'AI-2.5', name: 'Professional Skills Engine', desc: 'مهارات مثرّاة — جودة، مصادر، إجراءات',    current: true  },
  { phase: 'AI-3',   name: 'SELECT-only SQL',           desc: 'طبقة SQL للقراءة فقط',                   current: false },
  { phase: 'AI-4',   name: 'Local LLM',                 desc: 'نموذج ذكاء اصطناعي محلي',               current: false },
  { phase: 'AI-5',   name: 'RAG',                       desc: 'استرجاع معزز من الوثائق',               current: false },
  { phase: 'AI-6',   name: 'Document AI',               desc: 'الذكاء الاصطناعي للوثائق',              current: false },
  { phase: 'AI-7',   name: 'Executive Insights',        desc: 'رؤى تنفيذية متقدمة',                    current: false },
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

const WHATS_NEW_AVAILABLE = [
  'واجهة المساعد الذكي',
  'أسئلة مقترحة تفاعلية',
  'سجل محادثات محلي',
  'اقتراحات مثبتة ⭐',
  'إجراءات سريعة',
  'نسخ وتصدير الردود',
  'إحصائيات الجلسة',
  'محرك مهارات محدد (AI-2) — بيانات حقيقية',
  'توجيه ذكي للطلبات (Prompt Router)',
  'نتائج هيكلية: إحصائيات، تنبيهات، بطاقات بيانات',
  '6 مهارات جاهزة: بنك، رواتب، مصروفات، عقود، لوحة تحكم، تقارير',
] as const;

const WHATS_NEW_SOON = [
  'SQL للقراءة فقط (AI-3)',
  'نموذج AI محلي (AI-4)',
  'RAG — استرجاع من المستندات (AI-5)',
  'ذكاء اصطناعي للوثائق / OCR (AI-6)',
  'رؤى تنفيذية متقدمة (AI-7)',
] as const;

const SUGGESTED_EMPTY = [
  'لخّص آخر كشف حساب مستورد',
  'أعلى الرواتب هذا الشهر',
  'اشرح تقرير الأرباح',
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

function buildNoSkillResult(prompt: string): SkillResult {
  const now = Date.now();
  return {
    skillId: 'none',
    skillTitleAr: 'غير محدد',
    intent: 'unknown',
    prompt,
    title: 'لم يتم التعرف على الطلب',
    summary: 'لم أتمكن من تحديد المهارة المناسبة. جرب أن تكون أكثر تحديداً، أو اختر من الاقتراحات أدناه.',
    statistics: [],
    warnings: [{ message: 'استخدم الاقتراحات الموجودة أو أعد صياغة سؤالك.', severity: 'info' }],
    sources: [],
    suggestedQuestions: [
      'لخّص آخر كشف حساب مستورد',
      'أعلى الرواتب هذا الشهر',
      'اعرض ملخص المصروفات',
      'اعرض المؤشرات الرئيسية',
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

  // ── State ──────────────────────────────────────────────────────────────────
  const [input,         setInput]         = useState('');
  const [messages,      setMessages]      = useState<AiMessage[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>(() => loadHistory());
  const [pinnedPrompts, setPinnedPrompts] = useState<Set<string>>(() => loadPinned());
  const [openPanels,    setOpenPanels]    = useState<Set<string>>(
    new Set(['history', 'whats-new', 'safety', 'arch', 'roadmap', 'sources']),
  );
  const [toast,         setToast]         = useState<string | null>(null);
  const [sending,       setSending]       = useState(false);
  const [renamingId,    setRenamingId]    = useState<string | null>(null);
  const [renameText,    setRenameText]    = useState('');
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [lastDecision,  setLastDecision]  = useState<RouterDecision | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const conversationRef  = useRef<HTMLDivElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const currentConvIdRef = useRef<string | null>(null);
  const toastTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const title = (messages.find(m => m.role === 'user')?.text ?? 'محادثة جديدة').slice(0, 45);
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
  }, [messages]);

  useEffect(() => { saveHistory(conversations); }, [conversations]);
  useEffect(() => { savePinned(pinnedPrompts); },  [pinnedPrompts]);

  // Cleanup timers on unmount
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

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

  const showToast = useCallback((text: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(text);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

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
        skillId: 'blocked', skillTitleAr: 'غير مدعوم', intent: 'blocked', prompt: text,
        title: 'هذا النطاق غير مدعوم حالياً',
        summary: decision.blockedMessage ?? 'هذا النطاق خارج نطاق المساعد الذكي الحالي.',
        statistics: [],
        warnings: [{ message: 'يمكنني مساعدتك في استكشاف كشف الحساب وتحليله.', severity: 'info' }],
        sources: [{ icon: '🏦', labelAr: 'مستكشف كشف الحساب', routePath: '/bank-reconciliation' }],
        suggestedQuestions: ['لخّص آخر كشف حساب مستورد', 'اعرض أكبر السحوبات', 'اعرض رسوم البنك'],
        executedAt: now, executionMs: 0,
      };
    } else if (decision.skillId) {
      result = await executeSkill(decision.skillId, text, decision.intent);
    } else {
      result = buildNoSkillResult(text);
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
  }, [sending]);

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
    showToast('تم مسح السجل ✓');
  }, [startNewConversation, showToast]);

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
      if (next.has(prompt)) { next.delete(prompt); showToast('تم إزالة التثبيت'); }
      else                   { next.add(prompt);    showToast('تم التثبيت ⭐'); }
      return next;
    });
  }, [showToast]);

  const handleCopyMessage = useCallback((text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast('تم النسخ ✓'))
        .catch(() => showToast('تعذّر النسخ'));
    } else {
      showToast('النسخ غير متاح في هذا الوضع');
    }
  }, [showToast]);

  const handleCopyMarkdown = useCallback((text: string) => {
    const md = '> ' + text.replace(/\n/g, '\n> ');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(md).then(() => showToast('تم نسخ Markdown ✓'));
    }
  }, [showToast]);

  const handleExportTxt = useCallback(() => {
    if (!messages.length) return;
    const lines = messages.map(m =>
      `[${m.role === 'user' ? 'المستخدم' : 'المساعد'}] ${formatTime(m.timestamp)}\n${m.text}`
    );
    const content =
      `المساعد الذكي — تصدير المحادثة\nالتاريخ: ${new Date().toLocaleDateString('ar-KW')}\n\n` +
      lines.join('\n\n---\n\n');
    downloadTxt(content, `ai-assistant-${Date.now()}.txt`);
    showToast('تم التصدير ✓');
  }, [messages, showToast]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    if (!action.available) { showToast('هذا الإجراء سيتوفر قريباً'); return; }
    if (action.type === 'navigate') { navigate(action.route); }
    else if (action.type === 'prompt' && action.prompt) { sendMessage(action.prompt); }
  }, [navigate, sendMessage, showToast]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="ai-page">

      {/* Toast (Package H) */}
      {toast && <div className="ai-toast">{toast}</div>}

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
            <div className="ai-activity-label">رسائل الجلسة</div>
            <div className="ai-activity-value">{sessionStats.msgCount}</div>
          </div>
        </div>
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">psychology</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">آخر مهارة</div>
            <div className="ai-activity-value ai-activity-trunc">
              {sessionStats.lastSkill ?? '—'}
            </div>
          </div>
        </div>
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">help_outline</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">آخر سؤال</div>
            <div className="ai-activity-value ai-activity-trunc">
              {sessionStats.lastQuestion ?? '—'}
            </div>
          </div>
        </div>
        <div className="ai-activity-card">
          <span className="material-symbols-outlined ai-activity-icon">history</span>
          <div className="ai-activity-info">
            <div className="ai-activity-label">محادثات محفوظة</div>
            <div className="ai-activity-value">{sessionStats.savedCount}</div>
          </div>
        </div>
      </div>

      {/* ── 3. Capability Cards ── */}
      <section className="ai-kpi-section">
        <div className="ai-kpi-section-label">
          <span className="material-symbols-outlined">task_alt</span>
          جاهز تجريبياً — انقر لإرسال سؤال سريع
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

      {/* ── 4. Quick Actions (Package C) ── */}
      <section>
        <div className="ai-section-label">
          <span className="material-symbols-outlined">bolt</span>
          إجراءات سريعة
        </div>
        <div className="ai-quick-grid">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.id}
              type="button"
              className={`ai-quick-card ${!action.available ? 'soon' : ''} ${action.type === 'navigate' ? 'nav' : ''}`}
              onClick={() => handleQuickAction(action)}
              title={!action.available ? 'قريباً' : action.label}
            >
              <span className="ai-quick-icon">{action.icon}</span>
              <span className="ai-quick-label">{action.label}</span>
              {!action.available && <span className="ai-quick-badge">قريباً</span>}
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
                  الاقتراحات المثبتة
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
                        title="إزالة التثبيت"
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
                اقتراحات ذكية
              </div>
              <span className="ai-panel-hint">⭐ ثبّت اقتراحاتك المفضلة</span>
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
                            title={pinnedPrompts.has(p) ? 'إزالة التثبيت' : 'تثبيت'}
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
                مساحة العمل
              </div>
              <div className="ai-chat-header-actions">
                {hasMessages && (
                  <button type="button" className="ai-chat-action-btn" onClick={handleExportTxt} title="تصدير .txt">
                    <span className="material-symbols-outlined">download</span>
                  </button>
                )}
                <button type="button" className="ai-chat-action-btn" onClick={startNewConversation} title="محادثة جديدة">
                  <span className="material-symbols-outlined">add_comment</span>
                </button>
              </div>
            </div>

            <div className="ai-chat-conversation" ref={conversationRef}>
              {!hasMessages && !sending ? (
                /* Enhanced Empty State (Package G) */
                <div className="ai-chat-empty">
                  <div className="ai-chat-empty-icon">🧠</div>
                  <div className="ai-chat-empty-title">المساعد جاهز للاستخدام</div>
                  <div className="ai-chat-empty-desc">
                    اختر سؤالاً من الاقتراحات أو من الإجراءات السريعة، أو اكتب طلبك مباشرة.
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
                    كل الردود تجريبية — لا SQL، لا تعديل بيانات، لا اتصال خارجي
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
                              title="نسخ"
                            >
                              <span className="material-symbols-outlined">content_copy</span>
                            </button>
                            <button
                              type="button"
                              className="ai-msg-action-btn"
                              onClick={() => handleCopyMarkdown(msg.text)}
                              title="نسخ Markdown"
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
                  placeholder="اكتب طلبك هنا… (Enter للإرسال، Shift+Enter لسطر جديد)"
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
                  title="إرسال"
                >
                  <span className="material-symbols-outlined">
                    {sending ? 'hourglass_top' : 'send'}
                  </span>
                </button>
                {hasMessages && (
                  <button type="button" className="ai-chat-clear-btn" onClick={startNewConversation} title="محادثة جديدة">
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
                سجل المحادثات
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
                    جديد
                  </button>
                  {conversations.length > 0 && (
                    <button type="button" className="ai-history-action-btn danger" onClick={handleClearAllHistory}>
                      <span className="material-symbols-outlined">delete_sweep</span>
                      مسح الكل
                    </button>
                  )}
                </div>
                {conversations.length === 0 ? (
                  <div className="ai-history-empty">لا توجد محادثات محفوظة بعد</div>
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
                            placeholder="عنوان المحادثة"
                            title="عنوان المحادثة"
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
                                title="تعديل العنوان"
                              >
                                <span className="material-symbols-outlined">edit</span>
                              </button>
                              <button
                                type="button"
                                className="ai-history-btn danger"
                                onClick={e => handleDeleteConversation(conv.id, e)}
                                title="حذف"
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
                المتاح والقادم
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
                    المتاح الآن
                  </div>
                  {WHATS_NEW_AVAILABLE.map(item => (
                    <div key={item} className="ai-whatsnew-item available">{item}</div>
                  ))}
                </div>
                <div className="ai-whatsnew-group">
                  <div className="ai-whatsnew-heading soon">
                    <span className="material-symbols-outlined">schedule</span>
                    قريباً
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
                مركز السلامة
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('safety') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('safety') && (
              <div className="ai-panel-body">
                <div className="ai-safety-warning">
                  <span className="material-symbols-outlined">warning</span>
                  كل الردود حالياً تجريبية فقط
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
                  لا يتم إرسال أي بيانات خارج الجهاز
                </div>
              </div>
            )}
          </div>

          {/* Architecture Panel */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('arch')}>
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
                    <div key={node.label} className="ai-arch-node-wrap">
                      <div className={`ai-arch-node ${node.type}`}>{node.label}</div>
                      {i < ARCH_NODES.length - 1 && <div className="ai-arch-arrow">↓</div>}
                    </div>
                  ))}
                </div>
                <div className="ai-arch-readonly">قراءة فقط — Read-Only</div>
              </div>
            )}
          </div>

          {/* Roadmap */}
          <div className="ai-panel">
            <div className="ai-panel-header collapsible" onClick={() => togglePanel('roadmap')}>
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
                مصادر البيانات
              </div>
              <span className={`material-symbols-outlined ai-panel-chevron ${openPanels.has('sources') ? 'open' : ''}`}>
                expand_more
              </span>
            </div>
            {openPanels.has('sources') && (
              <div className="ai-panel-body">
                <p className="ai-sources-note">ستظهر مصادر البيانات المستخدمة هنا في المراحل القادمة.</p>
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
            <h2 className="ai-skills-title">مهارات المساعد المستقبلية</h2>
            <p className="ai-skills-subtitle">وصف شامل للقدرات التحليلية المخططة — قراءة فقط في المراحل الأولى</p>
          </div>
        </div>
        <div className="ai-skills-grid">
          {SKILL_CARDS.map(card => (
            <div key={card.id} className={`ai-skill-card ${card.statusCls === 'future' ? 'dimmed' : ''}`}>
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
