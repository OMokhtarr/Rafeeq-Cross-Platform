import React, { useEffect, useRef } from "react";
import { useLang } from "../../../core/context/LanguageContext";
import "./QuizExitModal.css";

interface Props {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const QuizExitModal: React.FC<Props> = ({ isOpen, onCancel, onConfirm }) => {
  const { t, isRTL } = useLang();
  const tt = t.quizTest;
  const backdropRef = useRef<HTMLDivElement>(null);

  // The fixed BottomNavBar is a sibling of IonContent, so it paints above
  // this sheet however high its z-index. Tag the owning IonPage while the
  // modal is open (see .qem-open in the stylesheet) to lift IonContent above
  // the nav, and untag it on close so the nav returns to the front.
  useEffect(() => {
    if (!isOpen) return;
    const page = backdropRef.current?.closest(".ion-page");
    if (!page) return;
    page.classList.add("qem-open");
    return () => page.classList.remove("qem-open");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="qem-backdrop" ref={backdropRef} onClick={onCancel}>
      <div className="qem-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="qem-message" style={{ direction: isRTL ? "rtl" : "ltr" }}>{tt.confirmExit}</p>
        <div className="qem-actions">
          <button className="qem-btn qem-cancel" onClick={onCancel}>
            {tt.exitCancel}
          </button>
          <button className="qem-btn qem-confirm" onClick={onConfirm}>
            {tt.exitConfirm}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizExitModal;
