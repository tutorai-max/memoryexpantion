/* app/chat/page.tsx
   ===== Next.js 14  +  Netlify build-safe版 =====
   - localStorage を必ず「ブラウザ側だけ」で呼び出すよう修正
   - Enter 送信 / Provider‑Model 切替え UI もそのまま
*/
'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { supabase } from '../../lib/supabaseClient';

/* 型定義 --------------------------------------------------------- */
type Project  = { id: string; name: string };
type Session  = { id: string; name: string; project_id: string };
type Message  = { id: number; role: 'user' | 'assistant'; content: string };
type Provider = 'gemini' | 'openai' | 'groq' | 'anthropic';
type ApiCfg   = {
  provider: Provider;
  model: string;
  keys: Record<Provider, string>;
};

/* 色など --------------------------------------------------------- */
const primary = 'bg-[#0d1b2a]';
const card    = 'bg-white shadow rounded';

/* メインコンポーネント ------------------------------------------- */
export default function ChatPage() {
  const router = useRouter();

  /* ------------ API 設定 state  -------------- */
  // ① デフォルト値だけ入れておく（localStorage は後で読む）
  const [cfg, setCfg] = useState<ApiCfg>({
    provider: 'gemini',
    model: 'gemini-1.5-flash',
    keys: { gemini: '', openai: '', groq: '', anthropic: '' },
  });

  // ② mounted 後に localStorage から読み取る
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('apiCfg');
      if (saved) setCfg(JSON.parse(saved));
    }
  }, []);

  // ③ 保存関数（ブラウザでのみ localStorage 書き込み）
  const saveCfg = (patch: Partial<ApiCfg>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('apiCfg', JSON.stringify(next));
    }
  };

  /* ------------ その他 state -------------- */
  const [projects, setProjects]   = useState<Project[]>([]);
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [selected, setSelected]   = useState<Session | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [loading , setLoading ]   = useState(true);
  const [newProj , setNewProj ]   = useState('');
  const [tmpSess , setTmpSess ]   = useState<Record<string,string>>({});
  const [input   , setInput   ]   = useState('');
  const [search  , setSearch  ]   = useState('');
  const [showCfg , setShowCfg ]   = useState(false);

  /* ------------ 認証チェック -------------- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
    });
  }, [router]);

  /* ------------ 初回ロード -------------- */
  useEffect(() => {
    (async () => {
      /* project */
      let proj =
        (await supabase.from('project').select('*').order('id')).data ?? [];
      if (!proj.length) {
        const { data } = await supabase
          .from('project')
          .insert({ name: 'Default' })
          .select()
          .single();
        proj = data ? [data] : [];
      }
      setProjects(proj);

      /* session */
      let sess =
        (await supabase.from('session').select('*').order('id')).data ?? [];
      if (!sess.length && proj[0]) {
        const { data } = await supabase
          .from('session')
          .insert({ name: 'First chat', project_id: proj[0].id })
          .select()
          .single();
        sess = data ? [data] : [];
      }
      setSessions(sess);
      if (sess[0]) await selectSession(sess[0]);
      setLoading(false);
    })();
  }, []);

  /* ------------ CRUD utils -------------- */
  async function addProject() {
    if (!newProj.trim()) return;
    const { data } = await supabase
      .from('project')
      .insert({ name: newProj })
      .select()
      .single();
    if (data) setProjects((p) => [...p, data]);
    setNewProj('');
  }

  async function addSession(pid: string) {
    const name = tmpSess[pid]?.trim();
    if (!name) return;
    const { data } = await supabase
      .from('session')
      .insert({ name, project_id: pid })
      .select()
      .single();
    if (data) setSessions((s) => [...s, data]);
    setTmpSess({ ...tmpSess, [pid]: '' });
  }

  async function moveSession(sid: string, pid: string) {
    await supabase.from('session').update({ project_id: pid }).eq('id', sid);
    setSessions((s) =>
      s.map((v) => (v.id === sid ? { ...v, project_id: pid } : v))
    );
  }

  /* ------------ select & chat -------------- */
  async function selectSession(s: Session) {
    setSelected(s);
    const { data } = await supabase
      .from('message')
      .select('*')
      .eq('session_id', s.id)
      .order('id');
    setMessages(data ?? []);
  }

  async function send() {
    if (!input.trim() || !selected) return;
    /* user message */
    const { data: user } = await supabase
      .from('message')
      .insert({ session_id: selected.id, role: 'user', content: input })
      .select()
      .single();
    if (!user) return;
    setMessages((m) => [...m, user]);
    setInput('');

    /* ask LLM */
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [...messages, user],
        provider: cfg.provider,
        model: cfg.model,
        apiKey: cfg.keys[cfg.provider],
      }),
    });
    const { reply } = await res.json();

    /* assistant message */
    const { data: bot } = await supabase
      .from('message')
      .insert({ session_id: selected.id, role: 'assistant', content: reply })
      .select()
      .single();
    if (bot) setMessages((m) => [...m, bot]);
  }

  /* ------------ Enter 送信 -------------- */
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* ------------ DnD 内部コンポーネント -------------- */
  const SessionItem = ({ s }: { s: Session }) => {
    const [, drag] = useDrag(() => ({ type: 'SESSION', item: { id: s.id } }), [
      s,
    ]);
    return (
      <li
        ref={(n) => {
          if (n) drag(n);
        }}
        className="cursor-pointer py-1"
        onClick={() => selectSession(s)}
      >
        {s.name}
      </li>
    );
  };

  const ProjectColumn = ({ p }: { p: Project }) => {
    const [, drop] = useDrop(
      () => ({ accept: 'SESSION', drop: (i: any) => moveSession(i.id, p.id) }),
      [sessions]
    );
    const list = sessions.filter((v) => v.project_id === p.id);
    return (
      <div
        ref={(n) => {
          if (n) drop(n);
        }}
        className={`${card} mb-4 p-2`}
      >
        <strong>{p.name}</strong>
        <ul className="pl-2">{list.map((s) => <SessionItem key={s.id} s={s} />)}</ul>
        <div className="flex space-x-1 mt-2">
          <input
            value={tmpSess[p.id] || ''}
            onChange={(e) =>
              setTmpSess({ ...tmpSess, [p.id]: e.target.value })
            }
            placeholder="新規セッション…"
            className="flex-1 border px-1 rounded"
          />
          <button
            onClick={() => addSession(p.id)}
            className={`${primary} text-white px-2 rounded`}
          >
            ＋
          </button>
        </div>
      </div>
    );
  };

  /* ------------ 画面描画 -------------- */
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen">
        {/* side */}
        <aside className={`${primary} text-white w-80 p-4 space-y-3 relative`}>
          <button
            onClick={() => setShowCfg(true)}
            className="absolute top-3 right-3 text-2xl"
          >
            ⚙️
          </button>

          <div className="space-y-1">
            <input
              value={newProj}
              onChange={(e) => setNewProj(e.target.value)}
              placeholder="新規プロジェクト…"
              className="w-full px-2 py-1 rounded text-black"
            />
            <button
              onClick={addProject}
              className="w-full bg-white text-[#0d1b2a] py-1 rounded"
            >
              追加
            </button>
          </div>

          <hr className="border-white/30" />
          <div className="overflow-y-auto h-[calc(100vh-220px)] pr-1">
            {projects.map((p) => (
              <ProjectColumn key={p.id} p={p} />
            ))}
          </div>

          <LoginMail />
        </aside>

        {/* chat */}
        <main className="flex-1 flex flex-col">
          <div className="p-2 border-b">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="履歴検索…"
              className="w-full border px-2 py-1 rounded"
            />
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-2">
            {(search
              ? messages.filter((m) => m.content.includes(search))
              : messages
            ).map((m, i) => (
              <p key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <span
                  className={`${card} inline-block px-3 py-1 ${
                    m.role === 'user' ? 'text-[#0d1b2a]' : ''
                  }`}
                >
                  {m.content}
                </span>
              </p>
            ))}
          </div>
          <div className="flex p-3 border-t space-x-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              className="flex-1 border px-2 rounded"
            />
            <button
              onClick={send}
              className={`${primary} text-white px-4 rounded`}
            >
              送信
            </button>
          </div>
        </main>

        {/* config modal */}
        {showCfg && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
            <div className={`${card} w-80 p-6`}>
              <h3 className="text-lg mb-3">API 設定</h3>

              {/* Provider */}
              <label className="block text-sm mb-1">Provider</label>
              <select
                value={cfg.provider}
                onChange={(e) => {
                  const p = e.target.value as Provider;
                  const def =
                    p === 'gemini'
                      ? 'gemini-1.5-flash'
                      : p === 'openai'
                      ? 'gpt-3.5-turbo'
                      : p === 'groq'
                      ? 'llama3-70b-8192'
                      : 'claude-3-haiku-20240307';
                  saveCfg({ provider: p, model: def });
                }}
                className="w-full border px-2 py-1 rounded mb-3"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="anthropic">Anthropic</option>
              </select>

              {/* Model */}
              <label className="block text-sm mb-1">Model</label>
              <select
                value={cfg.model}
                onChange={(e) => saveCfg({ model: e.target.value })}
                className="w-full border px-2 py-1 rounded mb-3"
              >
                {cfg.provider === 'gemini' && (
                  <>
                    <option value="gemini-1.5-flash">1.5‑flash</option>
                    <option value="gemini-1.5-pro">1.5‑pro</option>
                  </>
                )}
                {cfg.provider === 'openai' && (
                  <>
                    <option value="gpt-3.5-turbo">GPT‑3.5‑turbo</option>
                    <option value="gpt-4o">GPT‑4o</option>
                  </>
                )}
                {cfg.provider === 'groq' && (
                  <option value="llama3-70b-8192">Llama‑3 70B</option>
                )}
                {cfg.provider === 'anthropic' && (
                  <option value="claude-3-haiku-20240307">Claude‑3 Haiku</option>
                )}
              </select>

              {/* Key */}
              <label className="block text-sm mb-1">API Key</label>
              <input
                value={cfg.keys[cfg.provider]}
                onChange={(e) =>
                  saveCfg({
                    keys: { ...cfg.keys, [cfg.provider]: e.target.value },
                  })
                }
                placeholder="API Key"
                className="w-full border px-2 py-1 rounded mb-4"
              />

              <button
                onClick={() => setShowCfg(false)}
                className={`${primary} text-white w-full py-1 rounded`}
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </DndProvider>
  );
}

/* ログインメールを左下表示 */
function LoginMail() {
  const [mail, setMail] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then((r) => setMail(r.data.user?.email || ''));
  }, []);
  return (
    <div className="absolute bottom-3 left-3 text-xs opacity-70">{mail}</div>
  );
}
