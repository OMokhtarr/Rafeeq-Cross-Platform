import React, { useEffect, useRef, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  fetchStreaks,
  fetchUserProfile,
  fetchAllNotes,
  deleteNote,
  type Streak,
  type UserProfile,
  type Note,
  UserApiError,
} from "../../core/services/api/user-api.client";
import {
  signIn,
  signOut,
  getStoredAccessToken,
} from "../../core/services/auth/oauth.service";
import AccountModal from "./AccountModal";
import GoalsCard from "./GoalsCard";
import "./Account.css";

type ModalType = "about" | "request" | "terms" | "privacy" | null;

const PRIVACY_SECTIONS = [
  {
    heading: null,
    body: "Rafeeq (\"the App\") is committed to protecting your privacy. This policy explains how we handle your data.",
  },
  {
    heading: "1. Data We Collect",
    body: "Locally stored data: Your preferences, bookmarks, recitation progress, and cached audio files are stored on your device only. This data never leaves your device and is not accessible to us.\nAccount data (optional): If you sign in with a Quran Foundation account, your reading streaks, bookmarks, and activity may be synced to your account. This data is managed by the Quran Foundation under their own privacy policy.",
  },
  {
    heading: "2. How We Use Data",
    body: "Local data is used solely to provide app functionality (remembering settings, resuming recitation, displaying bookmarks). No personal data is sold, shared, or used for advertising.",
  },
  {
    heading: "3. Third‑Party Services",
    body: "The App integrates with the Quran Foundation API to fetch Quranic content, recitations, and (optionally) to sync your activity. Please refer to the Quran Foundation's privacy policy for details on how they handle your data.",
  },
  {
    heading: "4. Data Security",
    body: "We do not collect or store your personal information on external servers. Any synced data is protected by the authentication mechanisms provided by the Quran Foundation.",
  },
  {
    heading: "5. Children's Privacy",
    body: "The App does not knowingly collect any personal information from children under the age of 13.",
  },
  {
    heading: "6. Changes",
    body: "We may update this policy from time to time. Continued use of the App after changes constitutes acceptance of the new policy.",
  },
  {
    heading: "Contact",
    body: "If you have questions about this policy, please contact us at or.mokhtar@gmail.com.",
  },
];

const TERMS_SECTIONS = [
  {
    heading: null,
    body: "Welcome to Rafeeq (\"the App\"). By using the App, you agree to these terms.",
  },
  {
    heading: "1. Usage",
    body: "Rafeeq is a Quran companion designed for reading, recitation, and learning. You may use the App for personal, non‑commercial purposes only.",
  },
  {
    heading: "2. Privacy & Data",
    body: "The App stores your preferences, bookmarks, and recitation progress locally on your device. When you sign in with a Quran Foundation account, your activity may be synced to your account according to their privacy policy. No personal data is sold or shared with third parties.",
  },
  {
    heading: "3. Intellectual Property",
    body: "Quranic text, fonts, and audio are provided by the Quran Foundation under their respective licenses. The App itself and its original code are owned by the developer.",
  },
  {
    heading: "4. Disclaimer",
    body: "The App is provided \"as is\" without warranties. The developer is not responsible for any errors in content or functionality.",
  },
  {
    heading: "5. Changes",
    body: "We may update these terms. Continued use after changes means you accept the new terms.",
  },
  {
    heading: "Contact",
    body: "or.mokhtar@gmail.com",
  },
];

const Account: React.FC = () => {
  const history = useHistory();
  const { lang, isRTL } = useLang();

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [streakOpen, setStreakOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [featureText, setFeatureText] = useState("");
  const [featureSent, setFeatureSent] = useState(false);
  const featureRef = useRef<HTMLTextAreaElement>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // Check login state once on mount (and whenever lang changes for error strings)
  useEffect(() => {
    getStoredAccessToken().then((token) => {
      setLoggedIn(!!token);
    });
  }, []);

  // Load all user data whenever the user becomes logged in
  useEffect(() => {
    if (!loggedIn) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchStreaks(10).catch((err) => {
        if (
          err instanceof UserApiError &&
          (err.status === 401 || err.status === 403)
        ) {
          setError(
            lang === "ar"
              ? "يرجى تسجيل الدخول لعرض بياناتك"
              : "Please sign in to view your data",
          );
        } else {
          setError(
            lang === "ar" ? "تعذر تحميل البيانات" : "Could not load data",
          );
        }
        return [];
      }),
      fetchUserProfile().catch(() => null),
      fetchAllNotes(100).catch(() => []),
    ]).then(([streaksData, profileData, notesData]) => {
      setStreaks(streaksData as Streak[]);
      setUserProfile(profileData as UserProfile | null);
      setNotes(notesData as Note[]);
      setLoading(false);
    });
  }, [loggedIn, lang]);

  const handleLogin = () => signIn();
  const handleLogout = async () => {
    await signOut();
    setLoggedIn(false);
    setUserProfile(null);
    setStreaks([]);
    setNotes([]);
    setError(null);
    setStreakOpen(false);
    setNotesOpen(false);
  };

  const activeStreak = streaks.find((s) => s.status === "ACTIVE");
  const longestStreak = streaks.reduce(
    (max, s) => (s.days > max ? s.days : max),
    0,
  );

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

  const displayName = userProfile
    ? [userProfile.firstName, userProfile.lastName].filter(Boolean).join(" ") ||
      userProfile.email ||
      (lang === "ar" ? "مستخدم" : "User")
    : null;

  const t = {
    title:          lang === "ar" ? "حسابي"                              : "My Account",
    subtitle:       lang === "ar" ? "الإحصاءات والإنجازات"               : "Stats & Achievements",
    back:           lang === "ar" ? "رجوع"                               : "Back",
    signIn:         lang === "ar" ? "تسجيل الدخول"                       : "Sign In",
    signOut:        lang === "ar" ? "تسجيل الخروج"                       : "Sign Out",
    signedIn:       lang === "ar" ? "مسجّل الدخول"                       : "Signed In",
    guest:          lang === "ar" ? "زائر"                               : "Guest",
    signInHint:     lang === "ar" ? "سجّل الدخول عبر Quran.com لمزامنة تقدمك" : "Sign in via Quran.com to sync your progress",
    streak:         lang === "ar" ? "سلسلة القراءة"                      : "Reading Streak",
    streakDays:     lang === "ar" ? "يوم متواصل"                         : "day streak",
    active:         lang === "ar" ? "نشط"                                : "Active",
    broken:         lang === "ar" ? "منقطع"                              : "Broken",
    longest:        lang === "ar" ? "أطول سلسلة"                         : "Longest",
    total:          lang === "ar" ? "المجموع"                            : "Total",
    loading:        lang === "ar" ? "جاري التحميل…"                      : "Loading…",
    noStreak:       lang === "ar" ? "لا توجد سلاسل قراءة بعد — ابدأ اليوم!" : "No reading streaks yet — start today!",
    quranReading:   lang === "ar" ? "قراءة القرآن"                       : "Quran reading",
    aboutApp:       lang === "ar" ? "عن التطبيق"                         : "About Rafeeq",
    requestFeature: lang === "ar" ? "اقتراح ميزة"                        : "Request a Feature",
    helpCenter:     lang === "ar" ? "مركز المساعدة"                      : "Help Center",
    shareApp:       lang === "ar" ? "مشاركة التطبيق"                     : "Share Application",
    rateApp:        lang === "ar" ? "تقييم التطبيق"                      : "Rate Application",
    terms:          lang === "ar" ? "شروط الخدمة"                        : "Terms of Service",
    privacy:        lang === "ar" ? "سياسة الخصوصية"                     : "Privacy Policy",
    deleteAccount:  lang === "ar" ? "حذف الحساب"                         : "Delete Account",
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

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: "Rafeeq",
        text: lang === "ar" ? "تطبيق رفيق للقرآن الكريم" : "Rafeeq – Quran companion app",
        url: "https://rafeeqapp.netlify.app",
      }).catch(() => {});
    } else {
      await navigator.clipboard.writeText("https://rafeeqapp.netlify.app").catch(() => {});
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

  const ProseContent: React.FC<{ sections: typeof PRIVACY_SECTIONS; updated: string }> = ({ sections, updated }) => (
    <div className="amod-prose">
      <p className="amod-updated">Last updated: {updated}</p>
      {sections.map((s, i) => (
        <React.Fragment key={i}>
          {s.heading && <h2>{s.heading}</h2>}
          {s.body.split("\n").map((line, j) => <p key={j}>{line}</p>)}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="account-page" dir={isRTL ? "rtl" : "ltr"}>

          {/* ── Header ── */}
          <header className="account-header">
            <button
              className="account-back"
              onClick={() => history.length > 1 ? history.goBack() : history.replace("/")}
              aria-label={t.back}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isRTL ? <path d="M5 12h14M13 5l7 7-7 7" /> : <path d="M19 12H5M12 5l-7 7 7 7" />}
              </svg>
            </button>
            <div className="account-header-titles">
              <h1 className="account-title">{t.title}</h1>
              <p className="account-subtitle">{t.subtitle}</p>
            </div>
            <div className="account-back" aria-hidden style={{ visibility: "hidden" }} />
          </header>

          <div className="account-body">

            {/* ── Profile card ── */}
            <div className="ac-card ac-profile-card">
              <div className="ac-profile-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="ac-profile-info">
                <p className="ac-profile-name">
                  {loggedIn && displayName ? displayName : loggedIn ? t.signedIn : t.guest}
                </p>
                {loggedIn && userProfile?.email && (
                  <p className="ac-profile-email">{userProfile.email}</p>
                )}
                {!loggedIn && <p className="ac-profile-hint">{t.signInHint}</p>}
              </div>
              {loggedIn ? (
                <button className="ac-action-btn ac-signout-btn" onClick={handleLogout}>{t.signOut}</button>
              ) : (
                <button className="ac-action-btn ac-signin-btn" onClick={handleLogin}>{t.signIn}</button>
              )}
            </div>

            {/* ── Streak card ── */}
            {loggedIn && (
              <div className="ac-card ac-streak-card">
                <button
                  className="ac-streak-header"
                  onClick={() => setStreakOpen((o) => !o)}
                  aria-expanded={streakOpen}
                >
                  <div className="ac-streak-header-left">
                    <span className="ac-streak-flame">🔥</span>
                    <div>
                      <p className="ac-streak-title">{t.streak}</p>
                      {!streakOpen && !loading && (
                        <p className="ac-streak-summary">
                          {activeStreak
                            ? `${activeStreak.days} ${t.streakDays}`
                            : lang === "ar" ? "لا توجد سلسلة نشطة" : "No active streak"}
                        </p>
                      )}
                    </div>
                  </div>
                  <svg className={`ac-chevron ${streakOpen ? "ac-chevron-up" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {streakOpen && (
                  <div className="ac-streak-body">
                    {loading ? (
                      <div className="ac-loading"><div className="ac-spinner" /><span>{t.loading}</span></div>
                    ) : error ? (
                      <p className="ac-error">{error}</p>
                    ) : (
                      <>
                        <div className="ac-streak-stats">
                          <div className="ac-streak-stat">
                            <span className="ac-streak-stat-val">{activeStreak?.days ?? 0}</span>
                            <span className="ac-streak-stat-lbl">{t.streakDays}</span>
                          </div>
                          <div className="ac-streak-stat-div" />
                          <div className="ac-streak-stat">
                            <span className="ac-streak-stat-val">{longestStreak}</span>
                            <span className="ac-streak-stat-lbl">{t.longest}</span>
                          </div>
                          <div className="ac-streak-stat-div" />
                          <div className="ac-streak-stat">
                            <span className="ac-streak-stat-val">{streaks.length}</span>
                            <span className="ac-streak-stat-lbl">{t.total}</span>
                          </div>
                        </div>

                        {streaks.length > 0 ? (
                          <ul className="ac-streak-list">
                            {streaks.map((s) => (
                              <li key={s.id} className="ac-streak-row">
                                <span className="ac-streak-row-icon">{s.status === "ACTIVE" ? "🔥" : "📅"}</span>
                                <div className="ac-streak-row-info">
                                  <span className="ac-streak-row-range">
                                    {formatDate(s.startDate)}
                                    {s.startDate !== s.endDate && ` — ${formatDate(s.endDate)}`}
                                  </span>
                                  <span className="ac-streak-row-type">
                                    {s.type === "QURAN" ? t.quranReading : s.type}
                                  </span>
                                </div>
                                <span className="ac-streak-row-days">
                                  {s.days}<span className="ac-streak-row-d">{lang === "ar" ? "ي" : "d"}</span>
                                </span>
                                <span className={`ac-badge ${s.status === "ACTIVE" ? "ac-badge-active" : "ac-badge-broken"}`}>
                                  {s.status === "ACTIVE" ? t.active : t.broken}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="ac-streak-empty">{t.noStreak}</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Goals card ── */}
            {loggedIn && <GoalsCard lang={lang} isRTL={isRTL} />}

            {/* ── Notes card ── */}
            {loggedIn && (
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
                      <p className="ac-error">{notesError}</p>
                    ) : notes.length === 0 ? (
                      <p className="ac-streak-empty">{t.noNotes}</p>
                    ) : (
                      <ul className="ac-notes-list">
                        {notes.map((note) => (
                          <li key={note.id} className="ac-note-row">
                            <div className="ac-note-row-info">
                              <span className="ac-note-row-verse">
                                {t.noteVerse} {note.verseKey}
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
            )}

            {/* ── Info group ── */}
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

            {/* ── Share / Rate group ── */}
            <div className="ac-group">
              <button className="ac-row" onClick={handleShare}>
                <span className="ac-row-label">{t.shareApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => {}}>
                <span className="ac-row-label">{t.rateApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </div>

            {/* ── Legal group ── */}
            <div className="ac-group">
              <button className="ac-row" onClick={() => setModal("terms")}>
                <span className="ac-row-label">{t.terms}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => setModal("privacy")}>
                <span className="ac-row-label">{t.privacy}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
            </div>

            {/* ── Danger zone ── */}
            {loggedIn && (
              <div className="ac-group">
                <button className="ac-row ac-row-danger" onClick={() => {}}>
                  <span className="ac-row-label">{t.deleteAccount}</span>
                </button>
              </div>
            )}

          </div>

          <BottomNavBar active="account" />
        </div>

        {/* ── Modals ── */}

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

        {modal === "terms" && (
          <AccountModal title={t.terms} onClose={() => setModal(null)}>
            <ProseContent sections={TERMS_SECTIONS} updated="12 May 2026" />
          </AccountModal>
        )}

        {modal === "privacy" && (
          <AccountModal title={t.privacy} onClose={() => setModal(null)}>
            <ProseContent sections={PRIVACY_SECTIONS} updated="12 May 2026" />
          </AccountModal>
        )}

      </IonContent>
    </IonPage>
  );
};

export default Account;
