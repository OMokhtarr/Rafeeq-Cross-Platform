import React, { useEffect, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  fetchStreaks,
  type Streak,
  UserApiError,
} from "../../core/services/api/user-api.client";
import {
  signIn,
  signOut,
  getStoredAccessToken,
} from "../../core/services/auth/oauth.service";

import "./Account.css";

const Account: React.FC = () => {
  const history = useHistory();
  const { lang, isRTL } = useLang();

  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchStreaks(10)
      .then((data) => {
        if (!cancelled) {
          setStreaks(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
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
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [lang]);

  useEffect(() => {
    getStoredAccessToken().then((token) => {
      setLoggedIn(!!token);
    });
  }, []);

  const handleLogin = () => signIn();
  const handleLogout = async () => {
    await signOut();
    setLoggedIn(false);
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
        {
          year: "numeric",
          month: "short",
          day: "numeric",
        },
      );
    } catch {
      return iso;
    }
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="account-page" dir={isRTL ? "rtl" : "ltr"}>
          {/* Header */}
          <header className="account-header">
            <button
              className="account-back"
              onClick={() =>
                history.length > 1 ? history.goBack() : history.replace("/")
              }
              aria-label={lang === "ar" ? "رجوع" : "Back"}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {isRTL ? (
                  <path d="M5 12h14M13 5l7 7-7 7" />
                ) : (
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                )}
              </svg>
            </button>
            <div className="account-header-titles">
              <h1 className="account-title">
                {lang === "ar" ? "حسابي" : "My Account"}
              </h1>
              <p className="account-subtitle">
                {lang === "ar"
                  ? "الإحصاءات والإنجازات"
                  : "Stats & Achievements"}
              </p>
            </div>
            <div
              className="account-back"
              aria-hidden
              style={{ visibility: "hidden" }}
            />
          </header>

          <div className="account-body">
            {/* Avatar section */}
            <div className="account-avatar-section">
              <div className="account-avatar">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <p className="account-guest-label">
                {loggedIn
                  ? lang === "ar"
                    ? "مستخدم مسجل"
                    : "Signed In"
                  : lang === "ar"
                  ? "زائر"
                  : "Guest"}
              </p>
              {!loggedIn && (
                <button className="bm-tab" onClick={handleLogin}>
                  {lang === "ar" ? "تسجيل الدخول" : "Sign In"}
                </button>
              )}
              {loggedIn && (
                <button
                  className="bm-tab"
                  onClick={handleLogout}
                  style={{ color: "#c0392b" }}
                >
                  {lang === "ar" ? "تسجيل الخروج" : "Sign Out"}
                </button>
              )}{" "}
              <p className="account-guest-hint">
                {lang === "ar"
                  ? "سجّل الدخول عبر تطبيق Quran.com لمزامنة تقدمك"
                  : "Sign in via Quran.com to sync your progress"}
              </p>
            </div>

            {/* Streak section */}
            <section className="account-section">
              <h2 className="account-section-title">
                {lang === "ar" ? "سلسلة القراءة" : "Reading Streak"}
              </h2>

              {loading ? (
                <div className="account-loading">
                  <div className="account-spinner" />
                  <span>{lang === "ar" ? "جاري التحميل…" : "Loading…"}</span>
                </div>
              ) : error ? (
                <div className="account-error">{error}</div>
              ) : (
                <>
                  {/* Current streak hero */}
                  <div className="streak-hero">
                    <div className="streak-flame">🔥</div>
                    <div className="streak-days-count">
                      {activeStreak ? activeStreak.days : 0}
                    </div>
                    <div className="streak-days-label">
                      {lang === "ar" ? "يوم متواصل" : "day streak"}
                    </div>
                    {activeStreak && (
                      <div className="streak-status-badge streak-status-active">
                        {lang === "ar" ? "نشط" : "Active"}
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  <div className="streak-stats-row">
                    <div className="streak-stat">
                      <div className="streak-stat-value">{longestStreak}</div>
                      <div className="streak-stat-label">
                        {lang === "ar" ? "أطول سلسلة" : "Longest"}
                      </div>
                    </div>
                    <div className="streak-stat-divider" />
                    <div className="streak-stat">
                      <div className="streak-stat-value">{streaks.length}</div>
                      <div className="streak-stat-label">
                        {lang === "ar" ? "سلاسل سابقة" : "Total streaks"}
                      </div>
                    </div>
                    <div className="streak-stat-divider" />
                    <div className="streak-stat">
                      <div className="streak-stat-value">
                        {streaks.filter((s) => s.status === "ACTIVE").length > 0
                          ? "✓"
                          : "—"}
                      </div>
                      <div className="streak-stat-label">
                        {lang === "ar" ? "حالة اليوم" : "Today"}
                      </div>
                    </div>
                  </div>

                  {/* Streak list */}
                  {streaks.length > 0 ? (
                    <ul className="streak-list">
                      {streaks.map((s) => (
                        <li key={s.id} className="streak-row">
                          <div className="streak-row-icon">
                            {s.status === "ACTIVE" ? "🔥" : "📅"}
                          </div>
                          <div className="streak-row-info">
                            <span className="streak-row-range">
                              {formatDate(s.startDate)}
                              {s.startDate !== s.endDate &&
                                ` — ${formatDate(s.endDate)}`}
                            </span>
                            <span className="streak-row-type">
                              {s.type === "QURAN"
                                ? lang === "ar"
                                  ? "قراءة القرآن"
                                  : "Quran reading"
                                : s.type}
                            </span>
                          </div>
                          <div className="streak-row-days">
                            <span className="streak-days-num">{s.days}</span>
                            <span className="streak-days-word">
                              {lang === "ar" ? "يوم" : "d"}
                            </span>
                          </div>
                          <span
                            className={`streak-status-badge ${
                              s.status === "ACTIVE"
                                ? "streak-status-active"
                                : "streak-status-broken"
                            }`}
                          >
                            {s.status === "ACTIVE"
                              ? lang === "ar"
                                ? "نشط"
                                : "Active"
                              : lang === "ar"
                              ? "منقطع"
                              : "Broken"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="streak-empty">
                      <span>🌙</span>
                      <p>
                        {lang === "ar"
                          ? "لا توجد سلاسل قراءة بعد — ابدأ قراءتك اليوم!"
                          : "No reading streaks yet — start reading today!"}
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>

          <BottomNavBar active="account" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Account;
