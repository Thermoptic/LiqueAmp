import { useState, type DragEvent } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

/**
 * Drag-and-drop reordering for lists (DESIGN §78). Always paired with
 * <ReorderButtons>, because HTML drag-and-drop does not work on touch screens
 * and must never be the only way to reorder.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function rowProps(index: number) {
    return {
      draggable: true,
      'data-dragging': dragIndex === index || undefined,
      'data-drag-over': overIndex === index && dragIndex !== index ? (dragIndex !== null && dragIndex < index ? 'after' : 'before') : undefined,
      onDragStart(e: DragEvent) {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
      },
      onDragOver(e: DragEvent) {
        if (dragIndex === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (overIndex !== index) setOverIndex(index);
      },
      onDrop(e: DragEvent) {
        e.preventDefault();
        if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index);
        setDragIndex(null);
        setOverIndex(null);
      },
      onDragEnd() {
        setDragIndex(null);
        setOverIndex(null);
      },
    };
  }

  return { rowProps };
}

export function DragHandle() {
  return (
    <span className="drag-handle" aria-hidden="true">
      <GripVertical size={14} />
    </span>
  );
}

interface ReorderButtonsProps {
  index: number;
  count: number;
  label: string;
  onMove(from: number, to: number): void;
}

export function ReorderButtons({ index, count, label, onMove }: ReorderButtonsProps) {
  return (
    <span className="reorder-buttons">
      <button type="button" className="btn btn--ghost btn--icon" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        aria-label={`Move ${label} down`}
        disabled={index >= count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        <ChevronDown size={14} />
      </button>
    </span>
  );
}
