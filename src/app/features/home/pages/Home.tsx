/**
 * HOME PAGE
 *
 * Replaces the splash screen as the app's main entry point.
 * Layout (matches design-system ui_kit Home):
 *   ┌──────────────────────────────┐
 *   │     RAFEEQ wordmark (small)  │
 *   │                              │
 *   │   بِسْمِ اللَّهِ              │
 *   │   الرَّحْمَٰنِ الرَّحِيمِ     │   ← centered, gold, large
 *   │                              │
 *   │   رفيق · RAFEEQ              │   ← brand stack at bottom
 *   ├──────────────────────────────┤
 *   │ Quran  Quiz  Azkar  Ahad ⚙   │   ← shared BottomNavBar
 *   └──────────────────────────────┘
 */

import React from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useLang } from "../../../core/context/LanguageContext";
import BottomNavBar from "../../../shared/components/bottom-nav/BottomNavBar";
import "./Home.css";

const Home: React.FC = () => {
  const { t } = useLang();

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="home-page-outer">
          <div className="home-screen">
            <div className="home-stage">
              {/* Top wordmark */}
              <div className="home-wordmark" aria-hidden="true">
                <span className="home-wordmark-ar">{t.appName}</span>
                <span className="home-wordmark-en">{t.appSub}</span>
              </div>

              {/* Centered Basmalah — the focal element, framed with gold dividers */}
              <div className="home-basmalah-wrap">
                <div className="home-basmalah-block">
                  <div className="home-basmalah-divider" aria-hidden="true" />
                  <div className="home-basmalah" lang="ar" dir="rtl">
                    {t.home.bismillah}
                  </div>
                  <div className="home-basmalah-divider" aria-hidden="true" />
                </div>
              </div>

              {/* Brand stack at the bottom of the stage */}
              <div className="home-brand">
                <div className="home-brand-line">
                  <span className="home-brand-ar">{t.appName}</span>
                  <span className="home-brand-sep">·</span>
                  <span className="home-brand-en">RAFEEQ</span>
                </div>
                <div className="home-brand-tag">{t.tagline}</div>
              </div>

              {/* Bottom gradient fade — blends into the app bg above the tab bar */}
              <div className="home-stage-fade" aria-hidden="true" />
            </div>

            <BottomNavBar active="home" />
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;
