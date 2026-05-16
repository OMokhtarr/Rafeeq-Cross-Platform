import React from "react";
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

  if (!isOpen) return null;

  return (
    <div className="qem-backdrop" onClick={onCancel}>
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
