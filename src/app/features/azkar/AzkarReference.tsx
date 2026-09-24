/**
 * AZKAR REFERENCE PAGE
 * The origin of a single zikr — the hadith it comes from, its narrator and
 * grade — opened from the reference button on a zikr card.
 */

import React from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useParams } from "react-router-dom";
import azkarData from "../../../data/azkarData";
import azkarReferences from "../../../data/azkarReferences";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import "./Azkar.css";

const AzkarReference: React.FC = () => {
  const history = useHistory();
  const { categoryId, zikrId } = useParams<{ categoryId: string; zikrId: string }>();
  const { t, isRTL } = useLang();
  const ta = t.azkar;

  const zikr = azkarData
    .flatMap((c: any) => c.azkar)
    .find((z: any) => z.id === zikrId);
  const ref = azkarReferences[zikrId];

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="azkar-page-wrapper">
          <div className="azkar-header">
            <button
              className="azkar-back-btn"
              onClick={() => history.push(`/azkar/${categoryId}`)}
              aria-label={ta.back}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {isRTL
                  ? <path d="M5 12h14M12 5l7 7-7 7" />
                  : <path d="M19 12H5M12 19l-7-7 7-7" />}
              </svg>
            </button>
            <div className="azkar-header-title">
              <h1 lang={isRTL ? "ar" : "en"}>{ta.referenceTitle}</h1>
            </div>
            <div style={{ width: 44 }} />
          </div>

          {zikr && (
            <div className="azkar-ref-container" dir="rtl">
              <p className="azkar-item-text azkar-ref-zikr" lang="ar">{zikr.text}</p>
              {zikr.note && (
                <p className="azkar-ref-note" lang="ar">{zikr.note}</p>
              )}

              <section className="azkar-ref-section">
                {ref ? (
                  <p className="azkar-ref-origin" lang="ar">{ref.origin}</p>
                ) : (
                  <p className="azkar-ref-empty" dir={isRTL ? "rtl" : "ltr"}>{ta.noOrigin}</p>
                )}
              </section>

              <dl className="azkar-ref-meta">
                {ref?.narrator && (
                  <div>
                    <dt>{ta.narrator}</dt>
                    <dd lang="ar">{ref.narrator}</dd>
                  </div>
                )}
                {ref?.grade && (
                  <div>
                    <dt>{ta.grade}</dt>
                    <dd lang="ar">{ref.grade}</dd>
                  </div>
                )}
                {zikr.source && (
                  <div>
                    <dt>{ta.citation}</dt>
                    <dd lang="ar">{zikr.source}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </IonContent>
      <BottomNavBar active="azkar" fixed />
    </IonPage>
  );
};

export default AzkarReference;
