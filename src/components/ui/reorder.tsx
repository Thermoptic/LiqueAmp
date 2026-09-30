import { useState, type DragEvent, type HTMLAttributes } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

/**
 * Drag-and-drop reordering for lists (DESIGN §78). Always paired with
 * <ReorderButtons>, because HTML drag-and-drop does not work on touch screens
 * and must never be the only way to reorder.
 *
 * Only the grip (<DragHandle {...handleProps(i)} />) starts a drag; the rows
 * are drop targets. A draggable row would turn a click that moves the mouse a
 * few pixels into a drag, and the row's play button would not get the click.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleProps(index: number) {
    return {
      draggable: true,
      onDragStart(e: DragEvent<HTMLElement>) {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        // the whole row follows the pointer, not just the grip
        const row = e.currentTarget.closest('li');
        if (row) {
          // keep the grab point: the pointer's offset within the row
          const box = row.getBoundingClientRect();
          e.dataTransfer.setDragImage(row, e.clientX - box.left, e.clientY - box.top);
        }
      },
      onDragEnd() {
        setDragIndex(null);
        setOverIndex(null);
      },
    };
  }

  function rowProps(index: number) {
    return {
      'data-dragging': dragIndex === index || undefined,
      'data-drag-over': overIndex === index && dragIndex !== index ? (dragIndex !== null && dragIndex < index ? 'after' : 'before') : undefined,
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
    };
  }

  return { rowProps, handleProps };
}

/** The grip that drags a row (pass handleProps(index)); hidden from assistive tech, which uses ReorderButtons. */
export function DragHandle(props: HTMLAttributes<HTMLSpanElement> & { draggable?: boolean }) {
  return (
    <span className="drag-handle" aria-hidden="true" {...props}>
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
