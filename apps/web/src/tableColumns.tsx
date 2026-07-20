import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { Check, Columns3, RotateCcw } from "lucide-react";

export type TableColumnDefinition<Id extends string> = {
  id: Id;
  label: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  hideable?: boolean;
  resizable?: boolean;
};

type StoredTablePreferences = {
  widths?: Record<string, number>;
  visibility?: Record<string, boolean>;
};

function initialWidths<Id extends string>(columns: readonly TableColumnDefinition<Id>[]) {
  return Object.fromEntries(columns.map((column) => [column.id, column.defaultWidth])) as Record<Id, number>;
}

function initialVisibility<Id extends string>(columns: readonly TableColumnDefinition<Id>[]) {
  return Object.fromEntries(columns.map((column) => [column.id, true])) as Record<Id, boolean>;
}

function readStoredPreferences<Id extends string>(
  storageKey: string,
  columns: readonly TableColumnDefinition<Id>[],
) {
  const widths = initialWidths(columns);
  const visibility = initialVisibility(columns);
  try {
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as StoredTablePreferences | null;
    if (!stored) return { widths, visibility };
    for (const column of columns) {
      const storedWidth = stored.widths?.[column.id];
      if (typeof storedWidth === "number" && Number.isFinite(storedWidth)) {
        widths[column.id] = Math.min(
          column.maxWidth ?? Number.POSITIVE_INFINITY,
          Math.max(column.minWidth ?? 32, storedWidth),
        );
      }
      if (column.hideable !== false && typeof stored.visibility?.[column.id] === "boolean") {
        visibility[column.id] = stored.visibility[column.id];
      }
    }
  } catch {
    // Le preferenze non valide vengono sostituite dai default correnti.
  }
  return { widths, visibility };
}

export function useTableColumns<Id extends string>(
  storageKey: string,
  columns: readonly TableColumnDefinition<Id>[],
) {
  const initial = useMemo(() => readStoredPreferences(storageKey, columns), [columns, storageKey]);
  const [widths, setWidths] = useState<Record<Id, number>>(initial.widths);
  const [visibility, setVisibility] = useState<Record<Id, boolean>>(initial.visibility);
  const [resizingColumn, setResizingColumn] = useState<Id | null>(null);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ widths, visibility }));
  }, [storageKey, visibility, widths]);

  const visibleColumns = useMemo(
    () => columns.filter((column) => visibility[column.id] !== false),
    [columns, visibility],
  );

  const visibleWidthTotal = useMemo(
    () => visibleColumns.reduce((total, column) => total + widths[column.id], 0),
    [visibleColumns, widths],
  );

  function isVisible(columnId: Id) {
    return visibility[columnId] !== false;
  }

  function widthPercent(columnId: Id) {
    return `${(widths[columnId] / Math.max(visibleWidthTotal, 1)) * 100}%`;
  }

  function adjacentColumn(columnId: Id) {
    const columnIndex = visibleColumns.findIndex((column) => column.id === columnId);
    if (columnIndex < 0) return null;
    return visibleColumns.slice(columnIndex + 1).find((column) => column.resizable !== false) ?? null;
  }

  function resizePair(columnId: Id, delta: number, startingWidths = widths) {
    const column = columns.find((candidate) => candidate.id === columnId);
    const adjacent = adjacentColumn(columnId);
    if (!column || column.resizable === false || !adjacent) return startingWidths;

    const currentStart = startingWidths[column.id];
    const adjacentStart = startingWidths[adjacent.id];
    const pairTotal = currentStart + adjacentStart;
    const currentMin = column.minWidth ?? 32;
    const adjacentMin = adjacent.minWidth ?? 32;
    const currentMax = Math.min(column.maxWidth ?? Number.POSITIVE_INFINITY, pairTotal - adjacentMin);
    const nextCurrent = Math.min(currentMax, Math.max(currentMin, currentStart + delta));
    const nextAdjacent = pairTotal - nextCurrent;
    return {
      ...startingWidths,
      [column.id]: nextCurrent,
      [adjacent.id]: nextAdjacent,
    };
  }

  function startResize(columnId: Id, event: ReactPointerEvent<HTMLButtonElement>) {
    const adjacent = adjacentColumn(columnId);
    if (!adjacent) return;
    event.preventDefault();
    event.stopPropagation();

    const table = event.currentTarget.closest("table");
    const tableWidth = table?.getBoundingClientRect().width ?? 1000;
    const startX = event.clientX;
    const startingWidths = { ...widths };
    const totalUnits = visibleColumns.reduce((total, column) => total + startingWidths[column.id], 0);
    const unitsPerPixel = totalUnits / Math.max(tableWidth, 1);
    setResizingColumn(columnId);
    document.body.classList.add("is-resizing-columns");

    function handlePointerMove(moveEvent: PointerEvent) {
      const delta = (moveEvent.clientX - startX) * unitsPerPixel;
      setWidths(resizePair(columnId, delta, startingWidths));
    }

    function stopResize() {
      setResizingColumn(null);
      document.body.classList.remove("is-resizing-columns");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize, { once: true });
    window.addEventListener("pointercancel", stopResize, { once: true });
  }

  function nudgeColumn(columnId: Id, delta: number) {
    setWidths((current) => resizePair(columnId, delta, current));
  }

  function canResize(columnId: Id) {
    const column = columns.find((candidate) => candidate.id === columnId);
    return column?.resizable !== false && Boolean(adjacentColumn(columnId));
  }

  function toggleColumn(columnId: Id) {
    const column = columns.find((candidate) => candidate.id === columnId);
    if (!column || column.hideable === false) return;
    setVisibility((current) => {
      const visibleHideable = columns.filter(
        (candidate) => candidate.hideable !== false && current[candidate.id] !== false,
      );
      if (current[columnId] !== false && visibleHideable.length <= 1) return current;
      return { ...current, [columnId]: current[columnId] === false };
    });
  }

  function showAllColumns() {
    setVisibility(initialVisibility(columns));
  }

  function resetWidths() {
    setWidths(initialWidths(columns));
  }

  return {
    columns,
    visibleColumns,
    visibility,
    resizingColumn,
    isVisible,
    widthPercent,
    canResize,
    startResize,
    nudgeColumn,
    toggleColumn,
    showAllColumns,
    resetWidths,
  };
}

export function TableColumnMenu<Id extends string>({
  label = "Campi",
  columns,
  visibility,
  onToggle,
  onShowAll,
  onResetWidths,
}: {
  label?: string;
  columns: readonly TableColumnDefinition<Id>[];
  visibility: Record<Id, boolean>;
  onToggle: (columnId: Id) => void;
  onShowAll: () => void;
  onResetWidths: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hideableColumns = columns.filter((column) => column.hideable !== false);
  const visibleCount = hideableColumns.filter((column) => visibility[column.id] !== false).length;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="table-column-menu" ref={menuRef}>
      <button
        className="button secondary compact-button table-column-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Columns3 size={16} />
        {label}
      </button>
      {open && (
        <div className="table-column-popover" role="menu" aria-label="Scegli i campi visibili">
          <div className="table-column-popover-head">
            <strong>Campi visibili</strong>
            <span>{visibleCount}/{hideableColumns.length}</span>
          </div>
          <div className="table-column-options">
            {hideableColumns.map((column) => {
              const checked = visibility[column.id] !== false;
              return (
                <label key={column.id} className="table-column-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={checked && visibleCount <= 1}
                    onChange={() => onToggle(column.id)}
                  />
                  <span className="table-column-check" aria-hidden="true">
                    {checked && <Check size={13} />}
                  </span>
                  <span>{column.label}</span>
                </label>
              );
            })}
          </div>
          <div className="table-column-popover-actions">
            <button type="button" onClick={onShowAll}>Mostra tutti</button>
            <button type="button" onClick={onResetWidths}>
              <RotateCcw size={13} />
              Ripristina larghezze
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResizableTableHeader<Id extends string>({
  column,
  canResize,
  resizing,
  onResizeStart,
  onNudge,
  className = "",
  ariaSort,
  children,
}: {
  column: TableColumnDefinition<Id>;
  canResize: boolean;
  resizing: boolean;
  onResizeStart: (columnId: Id, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onNudge: (columnId: Id, delta: number) => void;
  className?: string;
  ariaSort?: "none" | "ascending" | "descending";
  children: ReactNode;
}) {
  return (
    <th className={`resizable-table-header ${resizing ? "resizing" : ""} ${className}`} aria-sort={ariaSort}>
      <div className="resizable-table-header-content">{children}</div>
      {canResize && (
        <button
          type="button"
          className="column-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-label={`Ridimensiona la colonna ${column.label}`}
          title={`Trascina per ridimensionare ${column.label}`}
          onPointerDown={(event) => onResizeStart(column.id, event)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            event.stopPropagation();
            onNudge(column.id, event.key === "ArrowLeft" ? -8 : 8);
          }}
        />
      )}
    </th>
  );
}
