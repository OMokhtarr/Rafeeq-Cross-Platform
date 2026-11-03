/**
 * DELETE ACCOUNT SHEET
 *
 * The confirm step behind Account → Delete account (store rules require a
 * full in-app deletion). Says exactly what goes, and that the store
 * subscription is not cancelled by it; a Pro subscriber gets Manage
 * subscription right there, before the Delete button.
 *
 * A failed deletion leaves the person signed in (the server deletes the
 * auth user last and stops at the first failing step), so the sheet stays
 * open with the error and Delete can be tapped again. Success closes it with
 * a toast; AuthProvider has already signed out by then.
 *
 * Same lifecycle as SignInSheet: Back closes it first, and leaving the page
 * that opened it closes it. Portalled to <body> to escape IonContent.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIonToast } from "@ionic/react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../core/context/AuthContext";
import { useLang } from "../../core/context/LanguageContext";
import { useSubscription } from "../../core/context/SubscriptionContext";
import { registerOverlay } from "../../core/utils/overlay-registry";
import "./DeleteAccountSheet.css";

interface DeleteAccountSheetProps {
  open: boolean;
  onClose: () => void;
}

const DeleteAccountSheet: React.FC<DeleteAccountSheetProps> = ({ open, onClose }) => {
  const { deleteAccount } = useAuth();
  const { isPro, showCustomerCenter } = useSubscription();
  const { t } = useLang();
  const [presentToast] = useIonToast();
  const { pathname } = useLocation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => (open ? registerOverlay(onClose) : undefined), [open, onClose]);

  const openedOnRef = useRef(pathname);
  useEffect(() => {
    if (!open) {
      openedOnRef.current = pathname;
      setFailed(false);
      return;
    }
    if (pathname !== openedOnRef.current) onClose();
  }, [open, pathname, onClose]);

  if (!open) return null;
  const ta = t.account;

  const onManage = async () => {
    try {
      await showCustomerCenter();
    } catch (err) {
      console.error("[pro] customer center failed", err);
      presentToast({ message: t.subscription.manageFailed, duration: 2500, position: "bottom" });
    }
  };

  const onDelete = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await deleteAccount();
    } catch (err) {
      console.error("[auth] account deletion failed", err);
      setFailed(true);
      return;
    } finally {
      setBusy(false);
    }
    onClose();
    presentToast({ message: ta.deleted, duration: 2500, position: "bottom" });
  };

  return createPortal(
    <div className="delacct-layer" dir={t.dir}>
      <div className="delacct-backdrop" onClick={onClose} />
      <div className="delacct-sheet" role="dialog" aria-modal="true" aria-labelledby="delacct-title">
        <button type="button" className="delacct-close" onClick={onClose} aria-label={ta.close}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <h2 id="delacct-title" className="delacct-title">
          {ta.deleteTitle}
        </h2>
        <p className="delacct-lede">{ta.deleteLede}</p>
        <ul className="delacct-what">
          {ta.deleteWhat.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="delacct-store">{ta.deleteStoreNote}</p>
        {failed && (
          <p className="delacct-error" role="alert">
            {ta.deleteFailed}
          </p>
        )}
        <div className="delacct-actions">
          {isPro && (
            <button type="button" className="rf-btn rf-btn--secondary rf-btn--block" onClick={() => void onManage()}>
              {t.subscription.manage}
            </button>
          )}
          <button type="button" className="rf-btn rf-btn--block delacct-delete" disabled={busy} onClick={() => void onDelete()}>
            {busy ? ta.deleting : ta.deleteAccount}
          </button>
          <button type="button" className="delacct-keep" onClick={onClose}>
            {ta.deleteKeep}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default DeleteAccountSheet;
