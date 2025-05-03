'use client';
import { useState } from 'react';
export default function ConfigPage() {
  const [apiKey, setApiKey] = useState('');
  function save() { localStorage.setItem('OPENAI_API_KEY', apiKey); alert('保存しました'); }
  return (
    <div className="p-8">
      <h1 className="text-xl mb-4">API設定</h1>
      <input type="text" placeholder="OpenAI / Gemini API Key" value={apiKey} onChange={e=>setApiKey(e.target.value)} className="w-full p-2 border rounded mb-2" />
      <button onClick={save} className="bg-green-600 text-white py-2 px-4 rounded">保存</button>
    </div>
  );
}