'use client';
import { Session } from '../types';
import { useDrag } from 'react-dnd';

interface Props {
  session: Session;
  onSelect: (s: Session) => void;
  onDelete: (id: number) => void;
}

export default function SessionItem({ session, onSelect, onDelete }: Props) {
  const [, drag] = useDrag(() => ({ type: 'SESSION', item: { id: session.id } }), []);
  const setRef = (n: HTMLLIElement | null) => { if (n) drag(n); };
  return (
    <li ref={setRef} className="mb-1 flex justify-between">
      <span onClick={() => onSelect(session)}>{session.name}</span>
      <button onClick={() => onDelete(session.id)}>🗑</button>
    </li>
  );
}