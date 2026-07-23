import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPosition = {
  left: number;
  top: number;
  placement: "top" | "bottom";
};

export function ManualOverrideIndicator({
  calculatedValue,
  onReset,
  resetLabel = "Annulla",
}: {
  calculatedValue: string;
  onReset: () => void;
  resetLabel?: string;
}) {
  const tooltipId = useId();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  function cancelClose() {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function updatePosition() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipWidth = 238;
    const gutter = 8;
    const left = Math.max(
      gutter,
      Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - gutter),
    );
    const placement = rect.top > 150 ? "top" : "bottom";
    setPosition({
      left,
      top: placement === "top" ? rect.top - 7 : rect.bottom + 7,
      placement,
    });
  }

  function showTooltip() {
    cancelClose();
    updatePosition();
    setOpen(true);
  }

  function scheduleClose() {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
  }

  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return (
    <>
      <button
        ref={anchorRef}
        className="manual-override-dot"
        type="button"
        aria-label={`Valore manuale. Calcolato: ${calculatedValue}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={showTooltip}
        onMouseLeave={scheduleClose}
        onFocus={showTooltip}
        onBlur={scheduleClose}
        onClick={(event) => {
          event.stopPropagation();
          if (open) {
            cancelClose();
            setOpen(false);
          } else {
            showTooltip();
          }
        }}
      >
        <span />
      </button>
      {open && position && createPortal(
        <div
          id={tooltipId}
          className={`manual-override-tooltip ${position.placement}`}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          onFocus={cancelClose}
          onBlur={scheduleClose}
        >
          <div>
            <strong>Manuale</strong>
            <span>Calcolato</span>
          </div>
          <b>{calculatedValue}</b>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
              onReset();
            }}
          >
            {resetLabel}
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
