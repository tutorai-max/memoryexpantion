'use client';
import { Project, Session } from '../types';
import { useDrop } from 'react-dnd';
import SessionItem from './SessionItem';

interface Props {
  project: Project;
  sessions: Session[];
  createSession: (pid: number, name: string) => void;
  deleteProject: (id: number) => void;
  deleteSession: (id: number) => void;
  onSelectSession: (s: Session) => void;
  onMoveSession: (sid: number, newPid: number) => void;
  tmpSessionNames: Record<number, string>;
  setTmpSessionNames: (f: (p: Record<number, string>) => Record<number, string>) => void;
}

export default function ProjectColumn(props: Props) {
  const { project, sessions, createSession, deleteProject, deleteSession, onSelectSession, onMoveSession, tmpSessionNames, setTmpSessionNames } = props;

  const [, drop] = useDrop(() => ({
    accept: 'SESSION',
    drop: (item: any) => onMoveSession(item.id, project.id),
  }), [sessions]);

  const setRef = (n: HTMLDivElement | null) => { if (n) drop(n); };

  return (
    <div ref={setRef} className="mb-4 p-2 border rounded">
      <div className="flex justify-between items-center mb-2">
        <strong>{project.name}</strong>
        <button onClick={() => deleteProject(project.id)}>🗑</button>
      </div>
      <ul>
        {sessions.map(s => (
          <SessionItem key={s.id} session={s} onSelect={onSelectSession} onDelete={deleteSession} />
        ))}
      </ul>
      <div className="mt-2 flex">
        <input
          value={tmpSessionNames[project.id] || ''}
          onChange={e => setTmpSessionNames(prev => ({ ...prev, [project.id]: e.target.value }))}
          placeholder="セッション名"
          className="flex-1 p-1 border rounded"
        />
        <button onClick={() => createSession(project.id, tmpSessionNames[project.id] || '')} className="ml-2 bg-green-500 text-white px-2 rounded">＋</button>
      </div>
    </div>
  );
}