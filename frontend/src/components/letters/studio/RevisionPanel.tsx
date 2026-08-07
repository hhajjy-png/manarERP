/**
 * Document Automation — Version History, Track Changes and Comments.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE RAIL, THREE TABS — BECAUSE THEY ARE THREE VIEWS OF ONE QUESTION.
 * ══════════════════════════════════════════════════════════════════════════
 * "What happened to this letter, and do I agree with it?" History answers it over
 * time, Track Changes answers it against a chosen point, Comments answers it in
 * people's own words. Built as three separate rails they would each need their own
 * baseline picker, their own navigation-to-target, and their own empty state — three
 * implementations of the same three things.
 *
 * They also share the ONE piece of state that matters: the BASELINE. Track Changes
 * diffs against it and History selects it, so putting them side by side is what makes
 * "compare with this version" a single click rather than a mode.
 *
 * ── THE DIFF IS COMPUTED HERE, NEVER ON THE SERVER ───────────────────────
 * The backend stores `contentJson` verbatim and does not parse it — comparing two
 * documents needs the block model, which only the renderer owns. A server-side diff
 * would be a second implementation of the model and would disagree with this one the
 * first time either changed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '../../explorer/ExplorerKit';
import {
  type CommentThread,
  type LetterVersionSummary,
  VERSION_KIND_LABELS_AR,
  createComment,
  createVersion,
  deleteComment,
  deleteVersion,
  getVersion,
  listComments,
  listVersions,
  parseMentions,
  restoreVersion,
  setCommentResolved,
} from '../../../api/letterRevisionsApi';
import {
  type ChangeCategory,
  type DocumentChange,
  CHANGE_CATEGORY_OF,
  CHANGE_KIND_LABELS_AR,
  changeCounts,
  diffDocuments,
  type DiffSections,
} from '../../../letters/revisions/documentDiff';
import { type BlockDocument } from '../../../letters/model/blockTypes';
import { parseDocument } from '../../../letters/editor/blockCommands';
import { type ResizableRail } from './useResizableRail';
import RailResizeHandle from './RailResizeHandle';
import './revision-panel.css';

export type RevisionTab = 'history' | 'changes' | 'comments';

/** The baseline a review is measured against. */
export interface Baseline {
  readonly versionId: number;
  readonly label: string;
  readonly document: BlockDocument;
  readonly sections: DiffSections;
}

export interface RevisionPanelProps {
  readonly letterId: number;
  readonly tab: RevisionTab;
  readonly onTabChange: (tab: RevisionTab) => void;
  readonly content: BlockDocument;
  readonly sections: DiffSections;
  readonly readOnly: boolean;
  /** Statistics the backend cannot compute — it never parses the block model. */
  readonly wordCount: number;
  readonly pageCount: number;
  readonly baseline: Baseline | null;
  readonly onBaselineChange: (baseline: Baseline | null) => void;
  /** Undo a single change. Applied by the composer through the pure command. */
  readonly onRejectChange: (change: DocumentChange) => void;
  /** Take the author to whatever a change or a comment points at. */
  readonly onNavigate: (target: { blockId?: string; objectId?: string; sectionKind?: string }) => void;
  /** Reload the letter after a restore — the server rewrote it. */
  readonly onRestored: () => void;
  readonly onClose: () => void;
  readonly resize: ResizableRail;
}

export default function RevisionPanel(props: RevisionPanelProps) {
  const { tab, onTabChange, onClose, resize } = props;

  return (
    <aside
      className="rev-panel lc-rail-in"
      aria-label="المراجعة والنسخ"
      ref={resize.railRef}
      style={{ '--rail-w': `${resize.width}px` } as React.CSSProperties}
    >
      <RailResizeHandle
        handleRef={resize.handleRef}
        label="تغيير عرض لوحة المراجعة"
        edge="after"
        onPointerDown={resize.startDrag}
        onKeyDown={resize.onHandleKeyDown}
      />
      <div className="rev-head">
        <Icon name="history" />
        <span className="rev-title">المراجعة</span>
        <button type="button" className="rev-close" onClick={onClose} aria-label="إغلاق لوحة المراجعة">
          <Icon name="close" />
        </button>
      </div>

      <div className="rev-tabs" role="tablist" aria-label="نوع المراجعة">
        {([
          { id: 'history' as const, label: 'النسخ', icon: 'history' },
          { id: 'changes' as const, label: 'التغييرات', icon: 'difference' },
          { id: 'comments' as const, label: 'التعليقات', icon: 'comment' },
        ]).map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`rev-tab${tab === entry.id ? ' is-on' : ''}`}
            onClick={() => onTabChange(entry.id)}
          >
            <Icon name={entry.icon} />
            {entry.label}
          </button>
        ))}
      </div>

      <div className="rev-body">
        {tab === 'history' && <HistoryTab {...props} />}
        {tab === 'changes' && <ChangesTab {...props} />}
        {tab === 'comments' && <CommentsTab {...props} />}
      </div>
    </aside>
  );
}

/* ══ Version history ═══════════════════════════════════════════════════════ */

function HistoryTab({
  letterId,
  readOnly,
  wordCount,
  pageCount,
  baseline,
  onBaselineChange,
  onRestored,
}: RevisionPanelProps) {
  const [versions, setVersions] = useState<LetterVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVersions(await listVersions(letterId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل النسخ.');
    } finally {
      setLoading(false);
    }
  }, [letterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async (named: boolean) => {
    const name = named ? window.prompt('اسم النسخة:') : null;
    if (named && !name) return;
    setBusy(true);
    try {
      await createVersion(letterId, { kind: named ? 'NAMED' : 'AUTO', name, wordCount, pageCount });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حفظ النسخة.');
    } finally {
      setBusy(false);
    }
  };

  /** Load a version's content and make it the review baseline. */
  const compare = async (version: LetterVersionSummary) => {
    if (baseline?.versionId === version.id) {
      onBaselineChange(null);
      return;
    }
    setBusy(true);
    try {
      const detail = await getVersion(letterId, version.id);
      const document = parseDocument(detail.contentJson);
      if (!document) {
        setError('تعذّرت قراءة محتوى هذه النسخة.');
        return;
      }
      onBaselineChange({
        versionId: version.id,
        label: version.name ?? `نسخة ${version.sequence}`,
        document,
        sections: {
          subject: detail.subject,
          issueDate: (detail.issueDate ?? '').slice(0, 10),
          recipientName: detail.recipientName ?? '',
          recipientTitle: detail.recipientTitle ?? '',
          recipientOrganisation: detail.recipientOrganisation ?? '',
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل النسخة.');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: LetterVersionSummary) => {
    // Confirmed because it overwrites the document. It is nonetheless UNDOABLE — the
    // server takes a PRE_RESTORE snapshot first — and the prompt says so, because a
    // warning that overstates the danger gets dismissed unread.
    if (!window.confirm(
      `سيُستبدل محتوى الخطاب بالنسخة «${version.name ?? version.sequence}».\n` +
      'تُحفَظ النسخة الحالية تلقائيًا قبل الاستعادة، فيمكن التراجع.',
    )) return;

    setBusy(true);
    try {
      await restoreVersion(letterId, version.id);
      await reload();
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّرت الاستعادة.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (version: LetterVersionSummary) => {
    if (!window.confirm('حذف هذه النسخة نهائيًا؟')) return;
    setBusy(true);
    try {
      await deleteVersion(letterId, version.id);
      if (baseline?.versionId === version.id) onBaselineChange(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحذف.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rev-actions">
        <button type="button" className="rev-action" onClick={() => void save(true)} disabled={readOnly || busy}>
          <Icon name="bookmark_add" />
          حفظ نسخة مسمّاة
        </button>
        <button type="button" className="rev-action rev-action--quiet" onClick={() => void save(false)} disabled={readOnly || busy}>
          <Icon name="save" />
          لقطة
        </button>
      </div>

      {error && <p className="rev-error"><Icon name="error" />{error}</p>}
      {loading && <p className="rev-muted">جارٍ التحميل…</p>}

      {!loading && versions.length === 0 && (
        <Empty message="لا نسخ محفوظة بعد. تُحفَظ لقطة تلقائيًا عند التسجيل وعند كل استعادة." />
      )}

      <ul className="rev-list">
        {versions.map((version) => (
          <li key={version.id} className={`rev-version${baseline?.versionId === version.id ? ' is-baseline' : ''}`}>
            <div className="rev-version-head">
              <span className="rev-seq">{version.sequence}</span>
              <span className="rev-version-name">{version.name ?? `نسخة ${version.sequence}`}</span>
              <span className={`rev-kind rev-kind--${version.kind}`}>{VERSION_KIND_LABELS_AR[version.kind]}</span>
            </div>

            <div className="rev-version-meta">
              {new Date(version.createdAt).toLocaleString('en-GB')}
              {version.createdByName && ` · ${version.createdByName}`}
              {version.wordCount > 0 && ` · ${version.wordCount} كلمة`}
              {version.pageCount > 0 && ` · ${version.pageCount} صفحة`}
            </div>

            {version.note && <p className="rev-note">{version.note}</p>}

            <div className="rev-version-actions">
              <button
                type="button"
                className={`rev-mini${baseline?.versionId === version.id ? ' is-on' : ''}`}
                onClick={() => void compare(version)}
                disabled={busy}
                title={baseline?.versionId === version.id ? 'إلغاء المقارنة' : 'مقارنة الخطاب الحالي بهذه النسخة'}
              >
                <Icon name="difference" />
                {baseline?.versionId === version.id ? 'إلغاء المقارنة' : 'مقارنة'}
              </button>
              <button
                type="button"
                className="rev-mini"
                onClick={() => void restore(version)}
                disabled={readOnly || busy}
                title="استعادة محتوى هذه النسخة"
              >
                <Icon name="settings_backup_restore" />
                استعادة
              </button>
              <button
                type="button"
                className="rev-mini rev-mini--danger"
                onClick={() => void remove(version)}
                // A PRE_REGISTER snapshot records the moment an irreversible number was
                // burned in; the server refuses to delete it, and the button says so
                // rather than letting the click fail.
                disabled={readOnly || busy || version.kind === 'PRE_REGISTER'}
                title={version.kind === 'PRE_REGISTER' ? 'لا يمكن حذف لقطة ما قبل التسجيل' : 'حذف النسخة'}
              >
                <Icon name="delete" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ══ Track changes ═════════════════════════════════════════════════════════ */

function ChangesTab({
  content,
  sections,
  baseline,
  readOnly,
  onRejectChange,
  onNavigate,
}: RevisionPanelProps) {
  const [filter, setFilter] = useState<ChangeCategory | null>(null);
  const [cursor, setCursor] = useState(0);

  const changes = useMemo(
    () => (baseline ? diffDocuments(baseline.document, content, baseline.sections, sections) : []),
    [baseline, content, sections],
  );

  const counts = useMemo(() => changeCounts(changes), [changes]);
  const shown = useMemo(
    () => (filter ? changes.filter((change) => CHANGE_CATEGORY_OF[change.kind] === filter) : changes),
    [changes, filter],
  );

  const go = useCallback(
    (index: number) => {
      if (shown.length === 0) return;
      const next = (index + shown.length) % shown.length;
      setCursor(next);
      const change = shown[next];
      onNavigate(
        change.kind.startsWith('object')
          ? { objectId: change.targetId }
          : change.kind === 'sectionChanged'
            ? { sectionKind: change.targetId }
            : { blockId: change.targetId },
      );
    },
    [shown, onNavigate],
  );

  if (!baseline) {
    return (
      <Empty message="اختر نسخة من تبويب «النسخ» ثم اضغط «مقارنة» لعرض التغييرات منذ تلك النسخة." />
    );
  }

  return (
    <>
      <p className="rev-baseline">
        <Icon name="difference" />
        المقارنة مع: <strong>{baseline.label}</strong>
      </p>

      {changes.length === 0 ? (
        <Empty message="لا فروق بين الخطاب الحالي وهذه النسخة." />
      ) : (
        <>
          <div className="rev-chips" role="group" aria-label="تصفية التغييرات">
            <FilterChip label={`الكل (${changes.length})`} on={filter === null} onClick={() => setFilter(null)} />
            <FilterChip label={`نص (${counts.text})`} on={filter === 'text'} onClick={() => setFilter('text')} />
            <FilterChip label={`تنسيق (${counts.format})`} on={filter === 'format'} onClick={() => setFilter('format')} />
            <FilterChip label={`عناصر (${counts.object})`} on={filter === 'object'} onClick={() => setFilter('object')} />
          </div>

          <div className="rev-nav">
            <button type="button" className="rev-mini" onClick={() => go(cursor - 1)} disabled={shown.length === 0}>
              <Icon name="keyboard_arrow_up" />
            </button>
            <span className="rev-nav-count">
              {shown.length === 0 ? '—' : `${Math.min(cursor + 1, shown.length)} / ${shown.length}`}
            </span>
            <button type="button" className="rev-mini" onClick={() => go(cursor + 1)} disabled={shown.length === 0}>
              <Icon name="keyboard_arrow_down" />
            </button>
          </div>

          <ul className="rev-list">
            {shown.map((change, index) => (
              <li key={change.id} className={`rev-change rev-change--${CHANGE_CATEGORY_OF[change.kind]}${index === cursor ? ' is-current' : ''}`}>
                <button
                  type="button"
                  className="rev-change-main"
                  onClick={() => go(index)}
                  title="الانتقال إلى موضع التغيير"
                >
                  <span className="rev-change-kind">{CHANGE_KIND_LABELS_AR[change.kind]}</span>
                  <span className="rev-change-summary">{change.summary}</span>

                  {change.runs && change.runs.length > 0 && (
                    <span className="rev-runs">
                      {change.runs.map((run, i) => (
                        <span key={i} className={`rev-run rev-run--${run.kind}`}>{run.text}</span>
                      ))}
                    </span>
                  )}
                </button>

                {/* ACCEPT IS DELIBERATELY ABSENT.
                    The author's document already contains every change, so accepting
                    one means agreeing with what is already there — a button that does
                    nothing. Only rejection alters anything, and it is offered. */}
                <button
                  type="button"
                  className="rev-mini rev-mini--danger"
                  onClick={() => onRejectChange(change)}
                  disabled={readOnly || change.kind === 'sectionChanged'}
                  title={
                    change.kind === 'sectionChanged'
                      ? 'حقول الأقسام تُستعاد من تبويب النسخ'
                      : 'رفض هذا التغيير وإعادته إلى ما كان في النسخة'
                  }
                >
                  <Icon name="undo" />
                  رفض
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/* ══ Comments ══════════════════════════════════════════════════════════════ */

function CommentsTab({ letterId, readOnly, onNavigate }: RevisionPanelProps) {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setThreads(await listComments(letterId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تحميل التعليقات.');
    } finally {
      setLoading(false);
    }
  }, [letterId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async (body: string, parentId: number | null) => {
    if (body.trim().length === 0) return;
    try {
      await createComment(letterId, { body: body.trim(), parentId, mentions: parseMentions(body) });
      setDraft('');
      setReplyDraft('');
      setReplyTo(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّرت إضافة التعليق.');
    }
  };

  const toggleResolved = async (thread: CommentThread) => {
    try {
      await setCommentResolved(letterId, thread.id, !thread.resolved);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تغيير حالة المناقشة.');
    }
  };

  const remove = async (commentId: number) => {
    if (!window.confirm('حذف هذا التعليق؟')) return;
    try {
      await deleteComment(letterId, commentId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحذف.');
    }
  };

  const open = threads.filter((thread) => !thread.resolved);
  const resolved = threads.filter((thread) => thread.resolved);
  const shown = showResolved ? threads : open;

  return (
    <>
      {!readOnly && (
        <div className="rev-composer">
          <textarea
            className="rev-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            rows={2}
            placeholder="أضف تعليقًا… استخدم @اسم للإشارة إلى شخص"
            aria-label="تعليق جديد"
          />
          <button type="button" className="rev-action" onClick={() => void add(draft, null)} disabled={draft.trim().length === 0}>
            <Icon name="send" />
            إضافة
          </button>
        </div>
      )}

      {error && <p className="rev-error"><Icon name="error" />{error}</p>}
      {loading && <p className="rev-muted">جارٍ التحميل…</p>}

      <div className="rev-chips" role="group" aria-label="تصفية التعليقات">
        <FilterChip label={`مفتوحة (${open.length})`} on={!showResolved} onClick={() => setShowResolved(false)} />
        <FilterChip label={`الكل (${threads.length})`} on={showResolved} onClick={() => setShowResolved(true)} />
      </div>

      {!loading && shown.length === 0 && (
        <Empty message={showResolved ? 'لا تعليقات على هذا الخطاب.' : `لا مناقشات مفتوحة.${resolved.length > 0 ? ' اعرض «الكل» للمغلقة.' : ''}`} />
      )}

      <ul className="rev-list">
        {shown.map((thread) => (
          <li key={thread.id} className={`rev-thread${thread.resolved ? ' is-resolved' : ''}`}>
            <CommentBody comment={thread} onDelete={() => void remove(thread.id)} readOnly={readOnly} />

            {thread.anchorId && (
              <button
                type="button"
                className="rev-anchor"
                onClick={() =>
                  onNavigate(
                    thread.anchorKind === 'object'
                      ? { objectId: thread.anchorId! }
                      : thread.anchorKind === 'section'
                        ? { sectionKind: thread.anchorId! }
                        : { blockId: thread.anchorId! },
                  )
                }
              >
                <Icon name="my_location" />
                الانتقال إلى الموضع
              </button>
            )}

            {thread.replies.map((reply) => (
              <div key={reply.id} className="rev-reply">
                <CommentBody comment={reply} onDelete={() => void remove(reply.id)} readOnly={readOnly} />
              </div>
            ))}

            <div className="rev-thread-actions">
              <button
                type="button"
                className={`rev-mini${thread.resolved ? ' is-on' : ''}`}
                onClick={() => void toggleResolved(thread)}
                disabled={readOnly}
              >
                <Icon name={thread.resolved ? 'refresh' : 'check_circle'} />
                {thread.resolved ? 'إعادة الفتح' : 'إغلاق المناقشة'}
              </button>
              {!readOnly && !thread.resolved && (
                <button
                  type="button"
                  className="rev-mini"
                  onClick={() => setReplyTo(replyTo === thread.id ? null : thread.id)}
                >
                  <Icon name="reply" />
                  ردّ
                </button>
              )}
            </div>

            {replyTo === thread.id && (
              <div className="rev-composer rev-composer--reply">
                <textarea
                  className="rev-textarea"
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  rows={2}
                  placeholder="اكتب ردًّا…"
                  aria-label="ردّ"
                  autoFocus
                />
                <button
                  type="button"
                  className="rev-action"
                  onClick={() => void add(replyDraft, thread.id)}
                  disabled={replyDraft.trim().length === 0}
                >
                  <Icon name="send" />
                  إرسال
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function CommentBody({
  comment,
  readOnly,
  onDelete,
}: {
  comment: { id: number; body: string; createdByName: string | null; createdAt: string; resolvedByName?: string | null };
  readOnly: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="rev-comment">
      <div className="rev-comment-head">
        <Icon name="account_circle" />
        <span className="rev-comment-author">{comment.createdByName ?? 'مستخدم'}</span>
        <span className="rev-comment-when">{new Date(comment.createdAt).toLocaleString('en-GB')}</span>
        {!readOnly && (
          <button type="button" className="rev-mini rev-mini--danger rev-mini--icon" onClick={onDelete} aria-label="حذف التعليق">
            <Icon name="delete" />
          </button>
        )}
      </div>
      {/* Mentions are highlighted by SPLITTING the text, never by injecting markup — the
          engine produces no HTML anywhere, and a comment body is user input. */}
      <p className="rev-comment-body">
        {comment.body.split(/(@[^\s@]+)/g).map((part, i) =>
          part.startsWith('@') ? <span key={i} className="rev-mention">{part}</span> : part,
        )}
      </p>
    </div>
  );
}

/* ── Small parts ────────────────────────────────────────────────────────── */

function FilterChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`rev-chip${on ? ' is-on' : ''}`} onClick={onClick} aria-pressed={on}>
      {label}
    </button>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <p className="rev-empty">
      <Icon name="inbox" />
      {message}
    </p>
  );
}
