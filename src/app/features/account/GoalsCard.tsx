import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  createGoal,
  deleteGoal,
  fetchGoalTimeline,
  fetchTodayGoalPlan,
  type Goal,
  type GoalDuration,
  type GoalTimeline,
  type TodayGoalPlan,
  updateGoal,
  UserApiError,
} from "../../core/services/api/user-api.client";

interface Props {
  lang: "ar" | "en";
  isRTL: boolean;
}

type ViewState = "summary" | "form";

const DURATION_OPTIONS: GoalDuration[] = ["DAILY", "WEEKLY", "MONTHLY"];

const GoalsCard: React.FC<Props> = ({ lang, isRTL }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewState>("summary");

  const [plan, setPlan] = useState<TodayGoalPlan | null>(null);
  const [timeline, setTimeline] = useState<GoalTimeline[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formAmount, setFormAmount] = useState("5");
  const [formDuration, setFormDuration] = useState<GoalDuration>("DAILY");

  const loadingRef = useRef(false);

  const t = {
    title:        lang === "ar" ? "أهداف القراءة"                : "Reading Goals",
    noGoal:       lang === "ar" ? "لا يوجد هدف — أنشئ واحداً"   : "No goal — create one",
    create:       lang === "ar" ? "إنشاء هدف"                    : "Create Goal",
    edit:         lang === "ar" ? "تعديل"                         : "Edit",
    delete:       lang === "ar" ? "حذف"                           : "Delete",
    save:         lang === "ar" ? "حفظ"                           : "Save",
    cancel:       lang === "ar" ? "إلغاء"                         : "Cancel",
    saving:       lang === "ar" ? "جاري الحفظ…"                   : "Saving…",
    deleting:     lang === "ar" ? "جاري الحذف…"                   : "Deleting…",
    loading:      lang === "ar" ? "جاري التحميل…"                 : "Loading…",
    pages:        lang === "ar" ? "صفحة"                          : "pages",
    pagesPerDay:  lang === "ar" ? "ص/ي"                           : "pg/day",
    timeline:     lang === "ar" ? "الجدول الزمني"                 : "Timeline",
    amount:       lang === "ar" ? "الكمية (صفحات)"                : "Amount (pages)",
    duration:     lang === "ar" ? "الفترة"                        : "Duration",
    daily:        lang === "ar" ? "يومي"                          : "Daily",
    weekly:       lang === "ar" ? "أسبوعي"                        : "Weekly",
    monthly:      lang === "ar" ? "شهري"                          : "Monthly",
    confirmDel:   lang === "ar" ? "هل تريد حذف هذا الهدف؟"       : "Delete this goal?",
    errLoad:      lang === "ar" ? "تعذّر تحميل الأهداف"           : "Could not load goals",
    errSave:      lang === "ar" ? "فشل الحفظ، حاول مجدداً"        : "Save failed, try again",
    errDel:       lang === "ar" ? "فشل الحذف، حاول مجدداً"        : "Delete failed, try again",
  };

  const durationLabel = (d: GoalDuration) => {
    if (d === "DAILY") return t.daily;
    if (d === "WEEKLY") return t.weekly;
    return t.monthly;
  };

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const todayPlan = await fetchTodayGoalPlan();
      setPlan(todayPlan);
      if (todayPlan?.goal) {
        const tl = await fetchGoalTimeline(
          todayPlan.goal.amount,
          todayPlan.goal.duration,
          todayPlan.goal.category,
        ).catch(() => []);
        setTimeline(tl);
      }
    } catch (err) {
      if (err instanceof UserApiError && (err.status === 401 || err.status === 403)) {
        setError(lang === "ar" ? "يرجى تسجيل الدخول" : "Please sign in");
      } else {
        setError(t.errLoad);
      }
    } finally {
      setLoading(false);
      setLoaded(true);
      loadingRef.current = false;
    }
  }, [lang, t.errLoad]);

  useEffect(() => {
    if (open && !loaded && !loadingRef.current) {
      load();
    }
  }, [open, loaded, load]);

  const openForm = (goal?: Goal) => {
    if (goal) {
      setFormAmount(String(goal.amount));
      setFormDuration(goal.duration);
    } else {
      setFormAmount("5");
      setFormDuration("DAILY");
    }
    setError(null);
    setView("form");
  };

  const handleSave = async () => {
    const amount = parseInt(formAmount, 10);
    if (!amount || amount < 1) return;
    setSaving(true);
    setError(null);
    try {
      if (plan?.goalId) {
        await updateGoal(plan.goalId, amount, formDuration);
      } else {
        await createGoal(amount, formDuration);
      }
      setLoaded(false);
      setTimeline([]);
      setView("summary");
      await load();
    } catch {
      setError(t.errSave);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!plan?.goalId) return;
    if (!window.confirm(t.confirmDel)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGoal(plan.goalId, plan.goal?.category);
      setPlan({ goalId: null, id: null });
      setTimeline([]);
      setView("summary");
    } catch {
      setError(t.errDel);
    } finally {
      setSaving(false);
    }
  };

  const hasGoal = !!(plan?.goalId);
  const goal = plan?.goal;

  return (
    <div className="ac-card ac-goals-card" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header row */}
      <button
        className="ac-goals-header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="ac-goals-header-left">
          <span className="ac-goals-icon">🎯</span>
          <div>
            <p className="ac-goals-title">{t.title}</p>
            {!open && !loading && (
              <p className="ac-goals-summary">
                {hasGoal && goal
                  ? `${goal.amount} ${t.pages} · ${durationLabel(goal.duration)}`
                  : t.noGoal}
              </p>
            )}
          </div>
        </div>
        <svg
          className={`ac-chevron ${open ? "ac-chevron-up" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="ac-goals-body">
          {loading ? (
            <div className="ac-loading">
              <div className="ac-spinner" />
              <span>{t.loading}</span>
            </div>
          ) : view === "form" ? (
            <div className="ac-goals-form">
              <label className="ac-goals-form-label">{t.amount}</label>
              <input
                className="ac-goals-form-input"
                type="number"
                min="1"
                max="604"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                dir="ltr"
              />

              <label className="ac-goals-form-label">{t.duration}</label>
              <div className="ac-goals-period-row">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    className={`ac-goals-period-btn ${formDuration === d ? "ac-goals-period-btn--active" : ""}`}
                    onClick={() => setFormDuration(d)}
                    type="button"
                  >
                    {durationLabel(d)}
                  </button>
                ))}
              </div>

              {error && <p className="ac-error">{error}</p>}

              <div className="ac-goals-form-actions">
                <button
                  className="ac-goals-btn ac-goals-btn--secondary"
                  onClick={() => { setView("summary"); setError(null); }}
                  disabled={saving}
                >
                  {t.cancel}
                </button>
                <button
                  className="ac-goals-btn ac-goals-btn--primary"
                  onClick={handleSave}
                  disabled={saving || !formAmount || parseInt(formAmount, 10) < 1}
                >
                  {saving ? t.saving : t.save}
                </button>
              </div>
            </div>
          ) : error ? (
            <p className="ac-error">{error}</p>
          ) : hasGoal && goal ? (
            <>
              <div className="ac-goals-stats">
                <div className="ac-goals-stat">
                  <span className="ac-goals-stat-val">{goal.amount}</span>
                  <span className="ac-goals-stat-lbl">{t.pages}</span>
                </div>
                <div className="ac-streak-stat-div" />
                <div className="ac-goals-stat">
                  <span className="ac-goals-stat-val">{durationLabel(goal.duration)}</span>
                  <span className="ac-goals-stat-lbl">{t.duration}</span>
                </div>
              </div>

              {timeline.length > 0 && (
                <div className="ac-goals-timeline">
                  <p className="ac-goals-timeline-title">{t.timeline}</p>
                  <ul className="ac-goals-timeline-list">
                    {timeline.map((item) => (
                      <li key={item.date} className="ac-goals-timeline-row">
                        <span className="ac-goals-timeline-date">
                          {new Date(item.date).toLocaleDateString(
                            lang === "ar" ? "ar-SA" : "en-GB",
                            { weekday: "short", month: "short", day: "numeric" },
                          )}
                        </span>
                        <span className="ac-goals-timeline-amount">
                          {item.minimumAmount}
                          <span className="ac-goals-timeline-unit"> {t.pagesPerDay}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="ac-goals-actions">
                <button
                  className="ac-goals-btn ac-goals-btn--secondary"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {saving ? t.deleting : t.delete}
                </button>
                <button
                  className="ac-goals-btn ac-goals-btn--primary"
                  onClick={() => openForm(goal)}
                  disabled={saving}
                >
                  {t.edit}
                </button>
              </div>
            </>
          ) : (
            <div className="ac-goals-empty">
              <p className="ac-goals-empty-text">{t.noGoal}</p>
              <button
                className="ac-goals-btn ac-goals-btn--primary"
                onClick={() => openForm()}
              >
                {t.create}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GoalsCard;
