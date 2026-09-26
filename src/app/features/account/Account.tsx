import React, { useCallback, useEffect, useRef, useState } from "react";
import { IonPage, IonContent, useIonViewWillEnter } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  fetchAllNotes,
  deleteNote,
  type Note,
} from "../../core/services/storage/notes.service";
import {
  loadPlanAsync,
  settleHifzFreezes,
  type PlanSession,
} from "../hifz/hifz.service";
import StreakPanel from "./StreakPanel";
import {
  exportBackupToFile,
  parseBackup,
  readBackupFile,
  restoreBackup,
  summarizeBackup,
  BackupError,
  type BackupSummary,
} from "../../core/services/storage/backup.service";
import AccountModal from "./AccountModal";
import "./Account.css";

type ModalType =
  | "about"
  | "request"
  | "restore"
  | null;

/** The website pages are the single source for the legal text. */
const LEGAL_BASE_URL = "https://omokhtarr.github.io/Rafeeq-Cross-Platform";

const Account: React.FC = () => {
  const history = useHistory();
  const { lang, isRTL } = useLang();

  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [featureText, setFeatureText] = useState("");
  const [featureSent, setFeatureSent] = useState(false);
  const featureRef = useRef<HTMLTextAreaElement>(null);

  // The streak panel derives everything else from the plan's sessions; this
  // page only has to load the plan. All local — no account, no network.
  const [sessions, setSessions] = useState<PlanSession[]>([]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // Backup & restore
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<
    { summary: BackupSummary; json: string } | null
  >(null);
  const [restoring, setRestoring] = useState(false);

  const loadLocalData = useCallback(async () => {
    setLoading(true);
    setNotesError(null);
    try {
      // The Hifz streak merges the persistent active-day store with the current
      // plan's completed sessions, so the plan has to be loaded to compute it.
      const plan = await loadPlanAsync();
      const planSessions: PlanSession[] = plan?.sessions ?? [];

      // Cover any missed days with a freeze before computing, so simply
      // opening this page after a lapse shows the streak intact rather than
      // broken. Idempotent, and a no-op when nothing was missed. Settled only
      // once the plan has loaded, or an empty session list would make the last
      // active day look older than it is.
      settleHifzFreezes(planSessions);

      setSessions(planSessions);
      setNotes(await fetchAllNotes());
    } catch (err) {
      console.error("[Account] loadLocalData failed:", err);
      setNotesError(
        lang === "ar" ? "تعذر تحميل الملاحظات" : "Could not load notes",
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  // Refresh when returning to the page — a Hifz session finished elsewhere
  // will have moved the streak.
  useIonViewWillEnter(() => {
    loadLocalData();
  });

  const handleExport = useCallback(async () => {
    setBackupError(null);
    setBackupMsg(null);
    try {
      const fileName = await exportBackupToFile();
      setBackupMsg(
        lang === "ar"
          ? `تم حفظ النسخة الاحتياطية: ${fileName}`
          : `Backup saved: ${fileName}`,
      );
    } catch (err) {
      console.error("[Account] export failed:", err);
      setBackupError(
        lang === "ar" ? "تعذر إنشاء النسخة الاحتياطية" : "Could not create the backup",
      );
    }
  }, [lang]);

  // Reading the file only previews it — nothing is written until the user
  // confirms in the restore dialog, since restoring replaces existing data.
  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Allow re-picking the same file later.
      e.target.value = "";
      if (!file) return;

      setBackupError(null);
      setBackupMsg(null);
      try {
        const json = await readBackupFile(file);
        const backup = parseBackup(json);
        setPendingRestore({ summary: summarizeBackup(backup), json });
        setModal("restore");
      } catch (err) {
        const code = err instanceof BackupError ? err.message : "unknown";
        setBackupError(
          code === "version_too_new"
            ? lang === "ar"
              ? "هذه النسخة أُنشئت بإصدار أحدث من التطبيق"
              : "This backup was made by a newer version of the app"
            : lang === "ar"
              ? "هذا الملف ليس نسخة احتياطية صالحة"
              : "That file is not a valid Rafeeq backup",
        );
      }
    },
    [lang],
  );

  const handleConfirmRestore = useCallback(async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    setBackupError(null);
    try {
      await restoreBackup(parseBackup(pendingRestore.json));
      setModal(null);
      setPendingRestore(null);
      await loadLocalData();
      // Nudge any other mounted view that reads these stores directly.
      window.dispatchEvent(new CustomEvent("hifz-streak-changed"));
      setBackupMsg(
        lang === "ar" ? "تمت استعادة بياناتك" : "Your data has been restored",
      );
    } catch (err) {
      console.error("[Account] restore failed:", err);
      setBackupError(
        lang === "ar" ? "تعذرت استعادة النسخة الاحتياطية" : "Could not restore the backup",
      );
      setModal(null);
    } finally {
      setRestoring(false);
    }
  }, [pendingRestore, lang, loadLocalData]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(
        lang === "ar" ? "ar-SA" : "en-GB",
        { year: "numeric", month: "short", day: "numeric" },
      );
    } catch {
      return iso;
    }
  };

  const t = {
    title:          lang === "ar" ? "حسابي"                              : "My Account",
    subtitle:       lang === "ar" ? "الإحصاءات والإنجازات"               : "Stats & Achievements",
    back:           lang === "ar" ? "رجوع"                               : "Back",
    streak:         lang === "ar" ? "سلسلة الحفظ"                        : "Streak",
    hifzStreak:     lang === "ar" ? "سلسلة الحفظ"                        : "Hifz Streak",
    days:           lang === "ar" ? "يوم"                                : "days",
    loading:        lang === "ar" ? "جاري التحميل…"                      : "Loading…",
    aboutApp:       lang === "ar" ? "عن التطبيق"                         : "About Rafeeq",
    backup:         lang === "ar" ? "النسخ الاحتياطي"                    : "Backup",
    exportData:     lang === "ar" ? "تصدير بياناتي"                      : "Export My Data",
    importData:     lang === "ar" ? "استعادة من ملف"                     : "Restore From File",
    backupHint:     lang === "ar"
      ? "احفظ ملاحظاتك وسلاسلك ومواضع القراءة في ملف، ثم استعدها على جهاز آخر."
      : "Save your notes, streaks and bookmarks to a file, then restore them on another device.",
    restoreTitle:   lang === "ar" ? "استعادة البيانات"                   : "Restore Data",
    restoreWarn:    lang === "ar"
      ? "سيحل محتوى هذا الملف محل البيانات الموجودة على هذا الجهاز. لا يمكن التراجع عن هذا الإجراء."
      : "This will replace the data currently on this device. This cannot be undone.",
    restoreConfirm: lang === "ar" ? "استعادة"                            : "Restore",
    restoring:      lang === "ar" ? "جاري الاستعادة…"                    : "Restoring…",
    cancel:         lang === "ar" ? "إلغاء"                              : "Cancel",
    requestFeature: lang === "ar" ? "اقتراح ميزة"                        : "Request a Feature",
    helpCenter:     lang === "ar" ? "مركز المساعدة"                      : "Help Center",
    shareApp:       lang === "ar" ? "مشاركة التطبيق"                     : "Share Application",
    rateApp:        lang === "ar" ? "تقييم التطبيق"                      : "Rate Application",
    comingSoon:     lang === "ar" ? "قريباً"                             : "Coming soon",
    terms:          lang === "ar" ? "شروط الخدمة"                        : "Terms of Service",
    privacy:        lang === "ar" ? "سياسة الخصوصية"                     : "Privacy Policy",
    retry:          lang === "ar" ? "حاول مجدداً"                        : "Try again",
    notes:          lang === "ar" ? "ملاحظاتي"                           : "My Notes",
    noNotes:        lang === "ar" ? "لا توجد ملاحظات بعد"                : "No notes yet",
    noteVerse:      lang === "ar" ? "الآية"                              : "Verse",
    send:           lang === "ar" ? "إرسال"                              : "Send",
    sent:           lang === "ar" ? "تم الإرسال!"                        : "Sent!",
    featurePlaceholder: lang === "ar"
      ? "صف الميزة التي تودّ إضافتها…"
      : "Describe the feature you'd like to see…",
    featureHint: lang === "ar"
      ? "اكتب اقتراحك وسنأخذه بعين الاعتبار."
      : "Write your suggestion and we'll take it into consideration.",
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      setNotesError(lang === "ar" ? "تعذر حذف الملاحظة" : "Could not delete note");
    }
  };

  const handleFeatureSubmit = () => {
    if (!featureText.trim()) return;
    const subject = encodeURIComponent("Rafeeq Feature Request");
    const body = encodeURIComponent(featureText.trim());
    window.open(`mailto:or.mokhtar@gmail.com?subject=${subject}&body=${body}`, "_blank");
    setFeatureSent(true);
    setFeatureText("");
    setTimeout(() => { setFeatureSent(false); setModal(null); }, 1800);
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="account-page" dir={isRTL ? "rtl" : "ltr"}>

          <div className="account-body">

            {/* ── Streak card — Hifz sessions, computed locally ── */}
            <div className="ac-card ac-streak-card">
              {/* Always open: the streak is the reason to visit this tab, and
                  the stats below already carry what a collapsed summary would
                  have said. */}
              <div className="ac-streak-header ac-streak-header--static">
                <div className="ac-streak-header-left">
                  <span className="ac-streak-flame">🍃</span>
                  <p className="ac-streak-title">{t.streak}</p>
                </div>
              </div>

              <div className="ac-streak-body">
                {loading ? (
                  <div className="ac-loading"><div className="ac-spinner" /><span>{t.loading}</span></div>
                ) : (
                  <StreakPanel sessions={sessions} lang={lang} />
                )}
              </div>
            </div>

            {/* ── Notes card ── */}
            <div className="ac-card ac-notes-card">
                <button
                  className="ac-streak-header"
                  onClick={() => setNotesOpen((o) => !o)}
                  aria-expanded={notesOpen}
                >
                  <div className="ac-streak-header-left">
                    <span className="ac-streak-flame">📝</span>
                    <div>
                      <p className="ac-streak-title">{t.notes}</p>
                      {!notesOpen && !loading && (
                        <p className="ac-streak-summary">
                          {notes.length > 0
                            ? `${notes.length} ${lang === "ar" ? "ملاحظة" : notes.length === 1 ? "note" : "notes"}`
                            : t.noNotes}
                        </p>
                      )}
                    </div>
                  </div>
                  <svg className={`ac-chevron ${notesOpen ? "ac-chevron-up" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {notesOpen && (
                  <div className="ac-streak-body">
                    {loading ? (
                      <div className="ac-loading"><div className="ac-spinner" /><span>{t.loading}</span></div>
                    ) : notesError ? (
                      <div className="ac-error-block">
                        <p className="ac-error">{notesError}</p>
                        <button className="ac-retry-btn" onClick={() => loadLocalData()}>{t.retry}</button>
                      </div>
                    ) : notes.length === 0 ? (
                      <p className="ac-streak-empty">{t.noNotes}</p>
                    ) : (
                      <ul className="ac-notes-list">
                        {notes.map((note) => (
                          <li key={note.id} className="ac-note-row">
                            <div className="ac-note-row-info">
                              <span className="ac-note-row-verse">
                                {t.noteVerse} {note.ranges?.[0] ?? ""}
                              </span>
                              <p className="ac-note-row-body">{note.body}</p>
                              <span className="ac-note-row-date">
                                {formatDate(note.updatedAt || note.createdAt)}
                              </span>
                            </div>
                            <button
                              className="ac-note-delete-btn"
                              onClick={() => handleDeleteNote(note.id)}
                              aria-label={lang === "ar" ? "حذف الملاحظة" : "Delete note"}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
            </div>

            {/* ── Info group ── */}
            <p className="ac-section-label">{lang === "ar" ? "معلومات" : "Info"}</p>
            <div className="ac-group">
              <button className="ac-row" onClick={() => setModal("about")}>
                <span className="ac-row-label">{t.aboutApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => { setFeatureSent(false); setModal("request"); setTimeout(() => featureRef.current?.focus(), 120); }}>
                <span className="ac-row-label">{t.requestFeature}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => window.open("mailto:or.mokhtar@gmail.com", "_blank")}>
                <span className="ac-row-label">{t.helpCenter}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
            </div>

            {/* ── Backup group — the cross-device path, since there is no account ── */}
            <p className="ac-section-label">{t.backup}</p>
            <p className="ac-group-hint">{t.backupHint}</p>
            <div className="ac-group">
              <button className="ac-row" onClick={handleExport}>
                <span className="ac-row-label">{t.exportData}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => fileInputRef.current?.click()}>
                <span className="ac-row-label">{t.importData}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
            </div>
            {backupMsg && <p className="ac-backup-msg" role="status">{backupMsg}</p>}
            {backupError && <p className="ac-backup-msg ac-backup-msg--error" role="alert">{backupError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFilePicked}
              style={{ display: "none" }}
            />

            {/* ── Share / Rate group — disabled until the app is published to the stores ── */}
            <p className="ac-section-label">{lang === "ar" ? "مشاركة" : "Share"}</p>
            <div className="ac-group ac-group-disabled">
              <span className="ac-soon-pill">{t.comingSoon}</span>
              <button className="ac-row" disabled aria-disabled>
                <span className="ac-row-label">{t.shareApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" disabled aria-disabled>
                <span className="ac-row-label">{t.rateApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </div>

            {/* ── Legal group ── */}
            <p className="ac-section-label">{lang === "ar" ? "قانوني" : "Legal"}</p>
            <div className="ac-group">
              <button className="ac-row" onClick={() => window.open(`${LEGAL_BASE_URL}/${lang === "ar" ? "terms-ar" : "terms"}.html`, "_blank")}>
                <span className="ac-row-label">{t.terms}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => window.open(`${LEGAL_BASE_URL}/${lang === "ar" ? "privacy-ar" : "privacy"}.html`, "_blank")}>
                <span className="ac-row-label">{t.privacy}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
            </div>

            <div className="ac-bottom-spacer" />
          </div>

        </div>

        {/* ── Modals ── */}
        {/* The freeze sheet is not here: StreakPanel owns it, so both this
            page and the Hifz sheet get it without either mounting it. */}

        {modal === "about" && (
          <AccountModal title={t.aboutApp} onClose={() => setModal(null)}>
            <div className="amod-about">
              <div className="amod-about-logo">📖</div>
              <p className="amod-about-name">Rafeeq</p>
              <p className="amod-about-tagline">
                {lang === "ar"
                  ? "رفيقك في رحلة قراءة القرآن الكريم — مصحف، تلاوة، وإحصاءات."
                  : "Your Quran companion — read, listen, and track your journey."}
              </p>
              <p className="amod-about-version">Version 1.0.0</p>
              <div className="amod-about-divider" />
              <div className="amod-about-row">
                <span className="amod-about-row-label">{lang === "ar" ? "المطوّر" : "Developer"}</span>
                <span className="amod-about-row-val">Omar Mokhtar</span>
              </div>
              <div className="amod-about-row">
                <span className="amod-about-row-label">{lang === "ar" ? "المحتوى" : "Content"}</span>
                <span className="amod-about-row-val">Quran Foundation</span>
              </div>
              <div className="amod-about-row">
                <span className="amod-about-row-label">{lang === "ar" ? "آخر تحديث" : "Last updated"}</span>
                <span className="amod-about-row-val">May 2026</span>
              </div>
            </div>
          </AccountModal>
        )}

        {modal === "request" && (
          <AccountModal title={t.requestFeature} onClose={() => setModal(null)}>
            <div className="amod-request">
              <p className="amod-request-label">{t.featureHint}</p>
              <textarea
                ref={featureRef}
                className="amod-request-textarea"
                placeholder={t.featurePlaceholder}
                value={featureText}
                onChange={(e) => setFeatureText(e.target.value)}
                dir={isRTL ? "rtl" : "ltr"}
              />
              <button
                className="amod-request-submit"
                onClick={handleFeatureSubmit}
                disabled={!featureText.trim() || featureSent}
              >
                {featureSent ? t.sent : t.send}
              </button>
            </div>
          </AccountModal>
        )}

        {modal === "restore" && pendingRestore && (
          <AccountModal title={t.restoreTitle} onClose={() => { setModal(null); setPendingRestore(null); }}>
            <div className="amod-request">
              <p className="amod-request-label">{t.restoreWarn}</p>
              <ul className="ac-restore-summary">
                <li>
                  <span>{t.notes}</span>
                  <strong>{pendingRestore.summary.notes}</strong>
                </li>
                <li>
                  <span>{lang === "ar" ? "المواضع المحفوظة" : "Bookmarks"}</span>
                  <strong>{pendingRestore.summary.bookmarks}</strong>
                </li>
                <li>
                  <span>{t.hifzStreak}</span>
                  <strong>{pendingRestore.summary.hifzStreakDays} {t.days}</strong>
                </li>
                <li>
                  <span>{lang === "ar" ? "متتبّع العبادات" : "Worship tracker"}</span>
                  <strong>{pendingRestore.summary.trackerDays} {t.days}</strong>
                </li>
                <li>
                  <span>{lang === "ar" ? "الأذكار المفضّلة" : "Favourite azkar"}</span>
                  <strong>{pendingRestore.summary.azkarFavorites}</strong>
                </li>
                <li>
                  <span>{lang === "ar" ? "نطاقات الاختبار المحفوظة" : "Saved quiz ranges"}</span>
                  <strong>{pendingRestore.summary.quizRangeSets}</strong>
                </li>
              </ul>
              <div className="ac-restore-actions">
                <button
                  className="ac-restore-cancel"
                  onClick={() => { setModal(null); setPendingRestore(null); }}
                  disabled={restoring}
                >
                  {t.cancel}
                </button>
                <button
                  className="amod-request-submit"
                  onClick={handleConfirmRestore}
                  disabled={restoring}
                >
                  {restoring ? t.restoring : t.restoreConfirm}
                </button>
              </div>
            </div>
          </AccountModal>
        )}

      </IonContent>
      <BottomNavBar active="more" fixed />
    </IonPage>
  );
};

export default Account;
