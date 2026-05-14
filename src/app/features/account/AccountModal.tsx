import React, { useEffect, useRef } from "react";
import "./AccountModal.css";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

const AccountModal: React.FC<Props> = ({ title, onClose, children }) => {
  const bodyRef = useRef<HTMLDivElement>(null);

  // close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="amod-backdrop" onClick={handleBackdrop} role="dialog" aria-modal>
      <div className="amod-sheet">
        <div className="amod-handle" />
        <div className="amod-titlebar">
          <span className="amod-title">{title}</span>
          <button className="amod-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="amod-body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default AccountModal;
