/* app/chat/page.tsx  ◆ 2025‑05‑06 フルソース
   ────────────────────────────────────────────────
   - プロジェクト／セッション追加・削除・DnD
   - 全メッセージ検索
   - API履歴保存・再利用 / 設定ボタン / デフォルトボタン
   - GPT‑3.5 デフォルト接続
   - APIエラー時に警告表示
   - TS2322 (ref 型) を as React.Ref<…> で解消
*/

'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { supabase } from '../../lib/supabaseClient';

/* ---------- 型宣言 ---------- */
type Project  = { id: string; name: string };
type Session  = { id: string; name: string; project_id: string };
type Message  = {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
};
type Provider = 'openai' | 'gemini' | 'groq' | 'anthropic';

type ApiCfg = {
  provider: Provider;
  model: string;
  keys: Record<Provider, string>;
};
type ApiHist = Record<Provider, { key: string; date: number }[]>;

/* ---------- Provider→Model 候補 ---------- */
const MODEL_OPTIONS: Record<Provider, string[]> = {
  openai: [
    'gpt-3.5-turbo',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3o-mini',
  ],
  gemini: [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash',
  ],
  groq: ['llama3-70b-8192'],
  anthropic: [
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
  ],
};

/* ---------- 色 ---------- */
const primary = 'bg-[#0d1b2a]';
const card = 'bg-white shadow rounded';

export default function ChatPage() {
  /* ── 認証 ── */
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
    });
  }, [router]);

  /* ── state ── */
  const [cfg, setCfg] = useState<ApiCfg>({
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    keys: { openai: '', gemini: '', groq: '', anthropic: '' },
  });
  const [hist, setHist] = useState<ApiHist>({
    openai: [],
    gemini: [],
    groq: [],
    anthropic: [],
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const s = localStorage.getItem('apiCfg');
      if (s) setCfg(JSON.parse(s));
      const h = localStorage.getItem('apiHist');
      if (h) setHist(JSON.parse(h));
    }
  }, []);

  const saveCfg = (patch: Partial<ApiCfg>, saveKey = false) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    if (typeof window !== 'undefined')
      localStorage.setItem('apiCfg', JSON.stringify(next));

    if (saveKey) {
      const arr = [
        { key: next.keys[next.provider], date: Date.now() },
        ...(hist[next.provider] || []),
      ]
        .filter(
          (v, i, self) => i === self.findIndex((x) => x.key === v.key)
        )
        .slice(0, 10);
      const nextHist = { ...hist, [next.provider]: arr };
      setHist(nextHist);
      localStorage.setItem('apiHist', JSON.stringify(nextHist));
    }
  };

  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProj, setNewProj] = useState('');
  const [tmpSess, setTmpSess] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [showCfg, setShowCfg] = useState(false);
  const [apiErr, setApiErr] = useState('');

  /* ── 初期ロード ── */
  useEffect(() => {
    (async () => {
      const proj =
        (await supabase.from('project').select('*').order('id')).data ?? [];
      setProjects(proj);
      const sess =
        (await supabase.from('session').select('*').order('id')).data ?? [];
      setSessions(sess);
      if (sess[0]) await selectSession(sess[0]);
      setLoading(false);
    })();
  }, []);

  /* ── CRUD ── */
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
  async function deleteProject(id: string) {
    await supabase.from('project').delete().eq('id', id);
    setProjects((p) => p.filter((v) => v.id !== id));
    setSessions((s) => s.filter((v) => v.project_id !== id));
    if (selected?.project_id === id) setSelected(null);
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
  async function deleteSession(id: string) {
    await supabase.from('session').delete().eq('id', id);
    setSessions((s) => s.filter((v) => v.id !== id));
    setMessages((m) => m.filter((v) => v.session_id !== id));
    if (selected?.id === id) setSelected(null);
  }
  async function moveSession(sid: string, pid: string) {
    await supabase.from('session').update({ project_id: pid }).eq('id', sid);
    setSessions((s) =>
      s.map((v) => (v.id === sid ? { ...v, project_id: pid } : v))
    );
  }

  /* ── select & chat ── */
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
    const { data: user } = await supabase
      .from('message')
      .insert({ session_id: selected.id, role: 'user', content: input })
      .select()
      .single();
    if (!user) return;
    setMessages((m) => [...m, user]);
    setInput('');
    setApiErr('');

    try {
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
      if (!res.ok) throw new Error('bad');
      const { reply } = await res.json();
      const { data: bot } = await supabase
        .from('message')
        .insert({ session_id: selected.id, role: 'assistant', content: reply })
        .select()
        .single();
      if (bot) setMessages((m) => [...m, bot]);
    } catch {
      setApiErr('APIの設定にエラーが発生しています');
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /* ── DnD 内部 ── */
  const SessionItem = ({ s }: { s: Session }) => {
    const [, dragRef] = useDrag(
      () => ({ type: 'SESSION', item: { id: s.id } }),
      [s]
    );
    return (
      <li
        ref={dragRef as React.Ref<HTMLLIElement>} // 型解決
        onClick={() => selectSession(s)}
        className="cursor-pointer flex justify-between items-center py-1 text-sm"
      >
        <span className="text-black">{s.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteSession(s.id);
          }}
          title="削除"
        >
          🗑
        </button>
      </li>
    );
  };

  const ProjectCol = ({ p }: { p: Project }) => {
    const [, dropRef] = useDrop(
      () => ({
        accept: 'SESSION',
        drop: (i: any) => moveSession(i.id, p.id),
      }),
      [sessions]
    );

    return (
      <div
        ref={dropRef as React.Ref<HTMLDivElement>} // 型解決
        className={`${card} mb-4 p-2`}
      >
        <div className="flex justify-between items-center">
          <strong className="text-[#333]">{p.name}</strong>
          <button onClick={() => deleteProject(p.id)} title="削除">
            🗑
          </button>
        </div>

        <ul className="pl-2">
          {sessions
            .filter((v) => v.project_id === p.id)
            .map((s) => (
              <SessionItem key={s.id} s={s} />
            ))}
        </ul>

        <div className="flex space-x-1 mt-2">
          <input
            className="flex-1 border px-1 rounded text-sm text-black"
            value={tmpSess[p.id] || ''}
            onChange={(e) =>
              setTmpSess({ ...tmpSess, [p.id]: e.target.value })
            }
            placeholder="新規セッション…"
          />
          <button
            onClick={() => addSession(p.id)}
            className={`${primary} text-white px-2 rounded text-sm`}
          >
            ＋
          </button>
        </div>
      </div>
    );
  };

  /* ── UI ── */
  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="flex h-screen">
        {/* sidebar */}
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
              <ProjectCol key={p.id} p={p} />
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
              className="w-full border px-2 py-1 rounded text-black"
            />
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-2 text-sm">
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
            {apiErr && <p className="text-red-600">{apiErr}</p>}
          </div>

          <div className="flex p-3 border-t space-x-2">
            <input
              className="flex-1 border px-2 rounded text-black"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
            />
            <button
              onClick={send}
              className={`${primary} text-white px-4 rounded`}
            >
              送信
            </button>
          </div>
        </main>

        {/* Config Modal */}
        {showCfg && (
          <ConfigModal
            cfg={cfg}
            hist={hist}
            saveCfg={saveCfg}
            close={() => setShowCfg(false)}
          />
        )}
      </div>
    </DndProvider>
  );
}

/* ── Config Modal コンポーネント ── */
function ConfigModal({
  cfg,
  hist,
  saveCfg,
  close,
}: {
  cfg: ApiCfg;
  hist: ApiHist;
  saveCfg: (p: Partial<ApiCfg>, saveKey?: boolean) => void;
  close: () => void;
}) {
  const [q, setQ] = useState('');
  const list = hist[cfg.provider].filter((v) => v.key.includes(q));

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
      <div className={`${card} w-[430px] p-6`}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg">API 設定</h3>
          <button
            onClick={() =>
              saveCfg(
                { provider: 'openai', model: 'gpt-3.5-turbo' },
                false
              )
            }
            className="px-2 py-1 text-xs bg-gray-200 rounded"
          >
            デフォルト
          </button>
        </div>

        {/* Provider */}
        <label className="block text-sm mb-1">Provider</label>
        <select
          value={cfg.provider}
          onChange={(e) => {
            const p = e.target.value as Provider;
            saveCfg(
              { provider: p, model: MODEL_OPTIONS[p][0] },
              false
            );
          }}
          className="w-full border px-2 py-1 rounded mb-3 text-black"
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="groq">Groq</option>
          <option value="anthropic">Anthropic</option>
        </select>

        {/* Model */}
        <label className="block text-sm mb-1">Model</label>
        <select
          value={cfg.model}
          onChange={(e) => saveCfg({ model: e.target.value }, false)}
          className="w-full border px-2 py-1 rounded mb-3 text-black"
        >
          {MODEL_OPTIONS[cfg.provider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Key */}
        <label className="block text-sm mb-1">API Key</label>
        <div className="flex space-x-2 mb-2">
          <input
            className="flex-1 border px-2 py-1 rounded text-black"
            value={cfg.keys[cfg.provider]}
            onChange={(e) =>
              saveCfg(
                { keys: { ...cfg.keys, [cfg.provider]: e.target.value } },
                false
              )
            }
            placeholder="API Key"
          />
          <button
            onClick={() => saveCfg({}, true)}
            className={`${primary} text-white px-3 rounded`}
          >
            設定
          </button>
        </div>

        {/* Key 履歴 + 検索 */}
        <label className="block text-sm mb-1">履歴</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="検索…"
          className="w-full border px-1 py-0.5 rounded text-black text-xs mb-1"
        />
        <div className="border p-2 h-28 overflow-auto">
          {list.map((v, i) => (
            <div
              key={i}
              className="flex items-center text-xs mb-1 truncate"
            >
              <span className="flex-1 truncate">{v.key}</span>
              <button
                onClick={() =>
                  saveCfg(
                    {
                      keys: { ...cfg.keys, [cfg.provider]: v.key },
                    },
                    false
                  )
                }
                className="ml-2 px-1 bg-gray-200 rounded"
              >
                これを使用
              </button>
            </div>
          ))}
          {!list.length && (
            <p className="text-xs opacity-60">履歴なし</p>
          )}
        </div>

        <button
          onClick={close}
          className={`${primary} text-white w-full py-1 mt-4 rounded`}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

/* ── メール表示 ── */
function LoginMail() {
  const [mail, setMail] = useState('');
  useEffect(() => {
    supabase.auth
      .getUser()
      .then((r) => setMail(r.data.user?.email || ''));
  }, []);
  return (
    <div className="absolute bottom-3 left-3 text-xs opacity-70">
      {mail}
    </div>
  );
}
