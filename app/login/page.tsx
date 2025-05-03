'use client';
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    let error;
    if (isSignUp) {
      // 新規登録
      ({ error } = await supabase.auth.signUp({ email, password }));
      if (!error) {
        alert("認証メールを送りました。メール内リンクで認証後、ログインしてください。");
      }
    } else {
      // ログイン
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
      if (!error) router.push("/chat");
    }
    if (error) alert(error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleAuth} className="bg-white p-8 rounded shadow-md w-80">
        <h1 className="text-2xl mb-4 text-center">
          {isSignUp ? "サインアップ" : "ログイン"}
        </h1>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-3 p-2 border rounded"
          required
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-3 p-2 border rounded"
          required
        />
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          {isSignUp ? "アカウント作成" : "ログイン"}
        </button>
        <p className="mt-4 text-center text-sm">
          {isSignUp ? "アカウントをお持ちですか？" : "アカウントがありませんか？"}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="ml-2 text-blue-600 underline"
          >
            {isSignUp ? "ログインへ" : "サインアップへ"}
          </button>
        </p>
      </form>
    </div>
  );
}
