import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "../../../core/context/LanguageContext";
import { useTheme } from "../../../core/context/ThemeContext";
import {
  addNote,
  deleteNote,
  fetchNotesForVerse,
  updateNote,
  type Note,
} from "../../../core/services/api/user-api.client";
import { getStoredAccessToken } from "../../../core/services/auth/oauth.service";
import "./NoteModal.css";

type View = "list" | "compose";

interface Props {
  /** Which mode to open in. "compose" goes straight to the add-note form. */
  initialView: View;
  open: boolean;
  verseKey: string | null;
  onClose: () => void;
}

const NoteModal: React.FC<Props> = ({ initialView, open, verseKey, onClose }) => {
  const { lang, isRTL } = useLang();
  const { isNight } = useTheme();

  const nightClass = isNight ? " nm--night" : "";

  const [view, setView] = useState<View>(initialView);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  // compose / edit state
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [draftText, setDraftText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const t = {
    title:         lang === "ar" ? "الملاحظات" : "Notes",
    addNote:       lang === "ar" ? "إضافة ملاحظة" : "Add Note",
    editNote:      lang === "ar" ? "تعديل الملاحظة" : "Edit Note",
    noNotes:       lang === "ar" ? "لا توجد ملاحظات لهذه الآية بعد" : "No notes for this verse yet",
    placeholder:   lang === "ar" ? "اكتب ملاحظتك هنا…" : "Write your note here…",
    save:          lang === "ar" ? "حفظ" : "Save",
    saving:        lang === "ar" ? "جاري الحفظ…" : "Saving…",
    delete:        lang === "ar" ? "حذف" : "Delete",
    edit:          lang === "ar" ? "تعديل" : "Edit",
    cancel:        lang === "ar" ? "إلغاء" : "Cancel",
    close:         lang === "ar" ? "إغلاق" : "Close",
    loginRequired: lang === "ar" ? "سجّل الدخول لإضافة ملاحظات" : "Sign in to add notes",
    errorLoad:     lang === "ar" ? "تعذر تحميل الملاحظات" : "Could not load notes",
    errorSave:     lang === "ar" ? "تعذر حفظ الملاحظة" : "Could not save note",
    errorDelete:   lang === "ar" ? "تعذر حذف الملاحظة" : "Could not delete note",
    back:          lang === "ar" ? "رجوع" : "Back",
  };

  // Check login state and load notes whenever modal opens
  useEffect(() => {
    if (!open || !verseKey) return;
    setView(initialView);
    setEditingNote(null);
    setDraftText("");
    setError(null);

    getStoredAccessToken().then((token) => {
      setLoggedIn(!!token);
      if (!token) return;
      setLoading(true);
      fetchNotesForVerse(verseKey)
        .then((data) => setNotes(data))
        .catch(() => setError(t.errorLoad))
        .finally(() => setLoading(false));
    });
  }, [open, verseKey]); // intentionally omits t.errorLoad — stable string, no re-fetch needed

  // Focus textarea when entering compose view
  useEffect(() => {
    if (view === "compose") {
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [view]);

  const openCompose = useCallback((note?: Note) => {
    setEditingNote(note ?? null);
    setDraftText(note?.body ?? "");
    setError(null);
    setView("compose");
  }, []);

  const handleSave = useCallback(async () => {
    if (!verseKey || !draftText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editingNote) {
        const updated = await updateNote(editingNote.id, draftText.trim());
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        const created = await addNote(verseKey, draftText.trim());
        setNotes((prev) => [created, ...prev]);
      }
      setView("list");
      setEditingNote(null);
      setDraftText("");
    } catch {
      setError(t.errorSave);
    } finally {
      setSaving(false);
    }
  }, [verseKey, draftText, editingNote, t.errorSave]);

  const handleDelete = useCallback(async (note: Note) => {
    setError(null);
    try {
      await deleteNote(note.id);
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch {
      setError(t.errorDelete);
    }
  }, [t.errorDelete]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-GB", {
        day: "numeric", month: "short", year: "numeric",
      });
    } catch { return iso; }
  };

  if (!open || !verseKey) return null;

  const [suraStr, ayaStr] = verseKey.split(":");
  const verseLabel = lang === "ar" ? `${suraStr}:${ayaStr}` : `${suraStr}:${ayaStr}`;

  return (
    <>
      <div className="nm-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className={`nm-sheet${nightClass}`}
        role="dialog"
        aria-label={t.title}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="nm-handle" aria-hidden="true" />

        <header className="nm-header">
          {view === "compose" ? (
            <button className="nm-back-btn" onClick={() => setView("list")} aria-label={t.back}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {isRTL
                  ? <path d="M5 12h14M13 5l7 7-7 7" />
                  : <path d="M19 12H5M12 5l-7 7 7 7" />}
              </svg>
            </button>
          ) : (
            <div style={{ width: 30 }} />
          )}

          <h3 className="nm-title">
            {view === "compose"
              ? (editingNote ? t.editNote : t.addNote)
              : `${t.title} · ${verseLabel}`}
          </h3>

          <div className="nm-header-actions">
            {view === "list" && loggedIn && (
              <button
                className={`nm-add-btn${nightClass}`}
                onClick={() => openCompose()}
                aria-label={t.addNote}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            )}
            <button className={`nm-close${nightClass}`} onClick={onClose} aria-label={t.close}>✕</button>
          </div>
        </header>

        {error && <p className="nm-error" role="alert">{error}</p>}

        {/* ── List view ── */}
        {view === "list" && (
          <div className="nm-body">
            {!loggedIn ? (
              <p className="nm-empty">{t.loginRequired}</p>
            ) : loading ? (
              <div className="nm-loading">
                <span className="nm-spinner" aria-hidden="true" />
                <span>{lang === "ar" ? "جاري التحميل…" : "Loading…"}</span>
              </div>
            ) : notes.length === 0 ? (
              <div className="nm-empty-state">
                <p className="nm-empty">{t.noNotes}</p>
                <button className="nm-compose-cta" onClick={() => openCompose()}>
                  {t.addNote}
                </button>
              </div>
            ) : (
              <ul className="nm-list">
                {notes.map((note) => (
                  <li key={note.id} className={`nm-note-item${nightClass}`}>
                    <p className="nm-note-body">{note.body}</p>
                    <div className="nm-note-footer">
                      <span className="nm-note-date">{formatDate(note.updatedAt || note.createdAt)}</span>
                      <div className="nm-note-actions">
                        <button
                          className={`nm-icon-btn${nightClass}`}
                          onClick={() => openCompose(note)}
                          aria-label={t.edit}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className={`nm-icon-btn nm-icon-btn--danger${nightClass}`}
                          onClick={() => handleDelete(note)}
                          aria-label={t.delete}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Compose view ── */}
        {view === "compose" && (
          <div className="nm-body">
            <textarea
              ref={textareaRef}
              className={`nm-textarea${nightClass}`}
              placeholder={t.placeholder}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              dir={isRTL ? "rtl" : "ltr"}
            />
            <div className="nm-compose-actions">
              <button
                className={`nm-cancel-btn${nightClass}`}
                onClick={() => setView("list")}
                disabled={saving}
              >
                {t.cancel}
              </button>
              <button
                className="nm-save-btn"
                onClick={handleSave}
                disabled={saving || !draftText.trim()}
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
};

export default NoteModal;
