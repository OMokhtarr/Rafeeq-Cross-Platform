import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./InlineSelect.css";

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  night?: boolean;
  fullWidth?: boolean;
  "aria-label"?: string;
}

const InlineSelect: React.FC<Props> = ({
  value,
  options,
  onChange,
  night = false,
  fullWidth = false,
  "aria-label": ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);
  const nightCls = night ? " isel--night" : "";

  // Position the portal list under the trigger whenever it opens
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const listMaxHeight = 240;

    // Prefer opening downward; flip up if not enough space
    if (spaceBelow >= Math.min(listMaxHeight, 120) || spaceBelow >= spaceAbove) {
      setListStyle({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(listMaxHeight, spaceBelow - 8),
      });
    } else {
      setListStyle({
        top: rect.top - 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(listMaxHeight, spaceAbove - 8),
        transform: "translateY(-100%)",
      });
    }
  }, [open]);

  // Close on outside tap / scroll
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    // Track whether the touch started inside the list so we can
    // ignore scroll events that are part of scrolling within it.
    let touchInsideList = false;
    const onTouchStart = (e: TouchEvent) => {
      touchInsideList = !!listRef.current?.contains(e.target as Node);
    };
    const closeOnScroll = (e: Event) => {
      // On mobile the scroll event target is often window/document, not the
      // list element, so we use the touchstart tracking to guard against
      // closing while the user is scrolling inside the dropdown.
      if (touchInsideList) return;
      if (listRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    // Defer registration by one tick so the tap that opened the dropdown
    // has finished bubbling before we start listening for outside clicks.
    const tid = setTimeout(() => {
      document.addEventListener("mousedown", close);
      document.addEventListener("touchend", close);
      document.addEventListener("touchstart", onTouchStart, true);
      window.addEventListener("scroll", closeOnScroll, true);
    }, 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchend", close);
      document.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  // Scroll selected option into view when list opens
  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLLIElement>("[data-selected='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const list = open
    ? createPortal(
        <>
          {/* Transparent backdrop: captures taps outside the list, closes the
              dropdown, and absorbs the trailing compatibility-click so it can't
              fall through to elements behind (e.g. surah cards). */}
          <div
            className="isel__backdrop"
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        <ul
          ref={listRef}
          className={`isel__list${nightCls}`}
          role="listbox"
          aria-label={ariaLabel}
          style={{ position: "fixed", zIndex: 9999, ...listStyle }}
        >
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              data-selected={o.value === value ? "true" : undefined}
              className={`isel__option${nightCls}${o.value === value ? " isel__option--active" : ""}`}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLLIElement).dataset.ptrX = String(e.clientX);
                (e.currentTarget as HTMLLIElement).dataset.ptrY = String(e.clientY);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                const startX = parseFloat((e.currentTarget as HTMLLIElement).dataset.ptrX ?? "0");
                const startY = parseFloat((e.currentTarget as HTMLLIElement).dataset.ptrY ?? "0");
                const dx = Math.abs(e.clientX - startX);
                const dy = Math.abs(e.clientY - startY);
                if (dx < 8 && dy < 8) {
                  onChange(o.value);
                  // Defer close so the list + backdrop stay mounted through any
                  // trailing touch→click compatibility event (which they then
                  // absorb), preventing click-through to the surah cards behind.
                  setTimeout(() => setOpen(false), 60);
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {o.label}
              {o.value === value && (
                <svg
                  viewBox="0 0 12 10"
                  width="12"
                  height="10"
                  className="isel__check"
                  aria-hidden="true"
                >
                  <polyline
                    points="1 5 5 9 11 1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </li>
          ))}
        </ul>
        </>,
        document.body,
      )
    : null;

  return (
    <div className={`isel${fullWidth ? " isel--full" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`isel__trigger${nightCls}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="isel__label">{selected?.label ?? value}</span>
        <svg
          className={`isel__arrow${open ? " isel__arrow--open" : ""}`}
          viewBox="0 0 10 6"
          width="10"
          height="6"
          aria-hidden="true"
        >
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {list}
    </div>
  );
};

export default InlineSelect;
