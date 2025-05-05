/* app/chat/page.tsx  ◆ 2025‑05‑05 指示①〜⑤完全対応版 ─ Enter送信・API切替・追加削除&DnD
   - デフォルトは OpenAI gpt‑3.5‑turbo（Geminiが未設定でも動く）
   - Providerごとに「全モデル候補」をドロップダウン
   - APIキーは ProviderごとにlocalStorage保存・後で再選択可
   - プロジェクト／セッションの追加・削除 + DnD移動
   - プロジェクト名 = 濃いグレー (#333)
*/
'use client';

import { useEffect, useState, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { supabase } from '../../lib/supabaseClient';

/* ---------- 型 ---------- */
type Project  = { id: string; name: string };
type Session  = { id: string; name: string; project_id: string };
type Message  = { id: number; role: 'user' | 'assistant'; content: string };
type Provider = 'openai' | 'gemini' | 'groq' | 'anthropic';

/* ---------- Provider → Model 候補 ---------- */
const MODEL_OPTIONS: Record<Provider,string[]> = {
  openai: [
    'gpt-3.5-turbo',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3o-mini'
  ],
  gemini: [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-1.0-pro',
    'gemini-2.0-flash'
  ],
  groq: ['llama3-70b-8192'],
  anthropic: [
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229'
  ]
};

type ApiCfg = {
  provider: Provider;
  model: string;
  keys: Record<Provider,string>;
};

/* ---------- 色 ---------- */
const primary = 'bg-[#0d1b2a]';
const card    = 'bg-white shadow rounded';

export default function ChatPage(){

/* ===== 0 認証 ===== */
const router=useRouter();
useEffect(()=>{supabase.auth.getSession()
  .then(({data:{session}})=>{if(!session)router.push('/login');});},[router]);

/* ===== 1 state ===== */
const [cfg,setCfg]=useState<ApiCfg>({
  provider:'openai',
  model:'gpt-3.5-turbo',
  keys:{openai:'',gemini:'',groq:'',anthropic:''}
});
/* localStorage 読み書き */
useEffect(()=>{if(window){
  const s=localStorage.getItem('apiCfg'); if(s) setCfg(JSON.parse(s));
}},[]);
const saveCfg=(patch:Partial<ApiCfg>)=>{
  const next={...cfg,...patch};
  setCfg(next);
  if(window) localStorage.setItem('apiCfg',JSON.stringify(next));
};

const [projects,setProjects]=useState<Project[]>([]);
const [sessions,setSessions]=useState<Session[]>([]);
const [selected,setSelected]=useState<Session|null>(null);
const [messages,setMessages]=useState<Message[]>([]);
const [loading ,setLoading ]=useState(true);
const [newProj ,setNewProj ]=useState('');
const [tmpSess ,setTmpSess ]=useState<Record<string,string>>({});
const [input   ,setInput   ]=useState('');
const [search  ,setSearch  ]=useState('');
const [showCfg ,setShowCfg ]=useState(false);

/* ===== 2 初回ロード ===== */
useEffect(()=>{(async()=>{
  const proj=(await supabase.from('project').select('*').order('id')).data??[];
  setProjects(proj);
  const sess=(await supabase.from('session').select('*').order('id')).data??[];
  setSessions(sess);
  if(sess[0]) await selectSession(sess[0]);
  setLoading(false);
})()},[]);

/* ===== 3 CRUD ===== */
async function addProject(){
  if(!newProj.trim())return;
  const {data}=await supabase.from('project').insert({name:newProj}).select().single();
  if(data) setProjects(p=>[...p,data]);
  setNewProj('');
}
async function deleteProject(pid:string){
  await supabase.from('project').delete().eq('id',pid);
  setProjects(p=>p.filter(v=>v.id!==pid));
  setSessions(s=>s.filter(v=>v.project_id!==pid));
  if(selected?.project_id===pid) setSelected(null);
}
async function addSession(pid:string){
  const name=tmpSess[pid]?.trim(); if(!name)return;
  const {data}=await supabase.from('session').insert({name,project_id:pid}).select().single();
  if(data) setSessions(s=>[...s,data]);
  setTmpSess({...tmpSess,[pid]:''});
}
async function deleteSession(sid:string){
  await supabase.from('session').delete().eq('id',sid);
  setSessions(s=>s.filter(v=>v.id!==sid));
  setMessages(m=>m.filter(v=>v.session_id!==sid));
  if(selected?.id===sid) setSelected(null);
}
async function moveSession(sid:string,pid:string){
  await supabase.from('session').update({project_id:pid}).eq('id',sid);
  setSessions(s=>s.map(v=>v.id===sid?{...v,project_id:pid}:v));
}

/* ===== 4 select & chat ===== */
async function selectSession(s:Session){
  setSelected(s);
  const {data}=await supabase.from('message').select('*').eq('session_id',s.id).order('id');
  setMessages(data??[]);
}
async function send(){
  if(!input.trim()||!selected) return;
  const {data:user}=await supabase.from('message')
    .insert({session_id:selected.id,role:'user',content:input}).select().single();
  if(!user)return;
  setMessages(m=>[...m,user]); setInput('');

  const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      messages:[...messages,user],
      provider:cfg.provider,
      model:cfg.model,
      apiKey:cfg.keys[cfg.provider],
    })});
  const {reply}=await res.json();

  const {data:bot}=await supabase.from('message')
    .insert({session_id:selected.id,role:'assistant',content:reply}).select().single();
  if(bot) setMessages(m=>[...m,bot]);
}
const onKey=(e:KeyboardEvent<HTMLInputElement>)=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}
};

/* ===== 5 DnD 内部 ===== */
const SessionItem=({s}:{s:Session})=>{
  const [,drag]=useDrag(()=>({type:'SESSION',item:{id:s.id}}),[s]);
  return(
    <li ref={n=>{if(n)drag(n)}} className="cursor-pointer flex justify-between items-center py-1 text-sm"
        onClick={()=>selectSession(s)}>
      <span>{s.name}</span>
      <button onClick={(e)=>{e.stopPropagation();deleteSession(s.id);}} title="削除">🗑</button>
    </li>
  );
};
const ProjectCol=({p}:{p:Project})=>{
  const [,drop]=useDrop(()=>({accept:'SESSION',drop:(i:any)=>moveSession(i.id,p.id)}),[sessions]);
  return(
    <div ref={n=>{if(n)drop(n)}} className={`${card} mb-4 p-2`}>
      <div className="flex justify-between items-center">
        <strong className="text-[#333]">{p.name}</strong>
        <button onClick={()=>deleteProject(p.id)} title="削除">🗑</button>
      </div>
      <ul className="pl-2">{sessions.filter(v=>v.project_id===p.id).map(s=><SessionItem key={s.id} s={s}/>)}</ul>
      <div className="flex space-x-1 mt-2">
        <input className="flex-1 border px-1 rounded text-sm"
          value={tmpSess[p.id]||''}
          onChange={e=>setTmpSess({...tmpSess,[p.id]:e.target.value})}
          placeholder="新規セッション…"/>
        <button onClick={()=>addSession(p.id)} className={`${primary} text-white px-2 rounded text-sm`}>＋</button>
      </div>
    </div>
  );
};

/* ===== 6 UI ===== */
if(loading) return <div className="p-6">Loading…</div>;
return(
<DndProvider backend={HTML5Backend}>
<div className="flex h-screen">

{/* ── sidebar ───────────────────────── */}
<aside className={`${primary} text-white w-80 p-4 space-y-3 relative`}>
  <button onClick={()=>setShowCfg(true)} className="absolute top-3 right-3 text-2xl">⚙️</button>

  <div className="space-y-1">
    <input value={newProj} onChange={e=>setNewProj(e.target.value)}
      placeholder="新規プロジェクト…" className="w-full px-2 py-1 rounded text-black"/>
    <button onClick={addProject} className="w-full bg-white text-[#0d1b2a] py-1 rounded">追加</button>
  </div>

  <hr className="border-white/30"/>
  <div className="overflow-y-auto h-[calc(100vh-220px)] pr-1">
    {projects.map(p=><ProjectCol key={p.id} p={p}/>)}
  </div>

  <LoginMail/>
</aside>

{/* ── chat area ─────────────────────── */}
<main className="flex-1 flex flex-col">
  <div className="p-2 border-b">
    <input value={search} onChange={e=>setSearch(e.target.value)}
      placeholder="履歴検索…" className="w-full border px-2 py-1 rounded"/>
  </div>

  <div className="flex-1 overflow-auto p-4 space-y-2 text-sm">
    {(search?messages.filter(m=>m.content.includes(search)):messages)
      .map((m,i)=><p key={i} className={m.role==='user'?'text-right':''}>
        <span className={`${card} inline-block px-3 py-1 ${m.role==='user'?'text-[#0d1b2a]':''}`}>
          {m.content}
        </span>
      </p>)}
  </div>

  <div className="flex p-3 border-t space-x-2">
    <input className="flex-1 border px-2 rounded" value={input}
      onChange={e=>setInput(e.target.value)} onKeyDown={onKey}/>
    <button onClick={send} className={`${primary} text-white px-4 rounded`}>送信</button>
  </div>
</main>

{/* ── Config Modal ──────────────────── */}
{showCfg&&(
  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
    <div className={`${card} w-96 p-6`}>
      <h3 className="text-lg mb-4">API 設定</h3>

      {/* Provider */}
      <label className="block text-sm mb-1">Provider</label>
      <select value={cfg.provider} onChange={e=>{
        const p=e.target.value as Provider;
        saveCfg({provider:p,model:MODEL_OPTIONS[p][0]});
      }} className="w-full border px-2 py-1 rounded mb-3">
        <option value="openai">OpenAI</option>
        <option value="gemini">Gemini</option>
        <option value="groq">Groq</option>
        <option value="anthropic">Anthropic</option>
      </select>

      {/* Model */}
      <label className="block text-sm mb-1">Model</label>
      <select value={cfg.model} onChange={e=>saveCfg({model:e.target.value})}
        className="w-full border px-2 py-1 rounded mb-3">
        {MODEL_OPTIONS[cfg.provider].map(m=><option key={m} value={m}>{m}</option>)}
      </select>

      {/* Key */}
      <label className="block text-sm mb-1">API Key</label>
      <input className="w-full border px-2 py-1 rounded mb-4"
        value={cfg.keys[cfg.provider]}
        onChange={e=>saveCfg({keys:{...cfg.keys,[cfg.provider]:e.target.value}})}
        placeholder="API Key"/>

      <button onClick={()=>setShowCfg(false)}
        className={`${primary} text-white w-full py-1 rounded`}>閉じる</button>
    </div>
  </div>
)}

</div>
</DndProvider>
);}

/* ── Login mail left-bottom ─────────── */
function LoginMail(){
  const [mail,setMail]=useState('');
  useEffect(()=>{supabase.auth.getUser().then(r=>setMail(r.data.user?.email||''));},[]);
  return <div className="absolute bottom-3 left-3 text-xs opacity-70">{mail}</div>;
}
