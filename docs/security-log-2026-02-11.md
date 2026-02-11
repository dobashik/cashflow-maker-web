# セキュリティ対応ログ — 2026-02-11

## 問題

Supabase Security Advisorより、`public.stocks` テーブルにRLS（Row Level Security）が無効であるとの警告。

- **対象テーブル**: `public.stocks`（株価マスタデータ）
- **リスク**: Supabaseの `anon` キーを知っている第三者が、テーブルの全データを読み書きできる可能性
- **深刻度**: 中（stocksテーブルは個人データではなく株価マスタだが、不正な書き込みのリスクあり）

## 対応内容

Supabase SQL Editorで以下を実行：

```sql
-- RLSを有効化
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;

-- ログイン済みユーザーは読み取りのみ許可
CREATE POLICY "authenticated_read_stocks"
  ON public.stocks
  FOR SELECT
  TO authenticated
  USING (true);

-- service_role（Cronジョブ等）はRLSをバイパスするためポリシー不要
```

## アクセス制御の結果

| ロール | SELECT | INSERT/UPDATE/DELETE |
|--------|--------|---------------------|
| 未認証（anon） | ❌ 拒否 | ❌ 拒否 |
| 認証済みユーザー | ✅ 許可 | ❌ 拒否 |
| service_role（Cronジョブ） | ✅ 許可 | ✅ 許可（RLSバイパス） |

## 確認方法

1. Supabase Dashboard → Table Editor → `stocks` → 「RLS enabled」表示を確認
2. Security Advisor の警告が消えていることを確認
3. アプリにログインして株価データが正常に表示されることを確認

## 備考

- `stocks` テーブルには `user_id` カラムが無い（全ユーザー共通の株価マスタ）
- 書き込みは `service_role` キー経由（Cronジョブ `api/cron/update-prices`）のみ
- `holdings` テーブルは既にRLS有効化済み（ユーザーごとのデータ）
- Supabaseへの個別連絡は不要（Security Advisorは自動チェックのため、修正すれば警告は自動消去）

## 今後の注意点

新しいテーブルを作成する際は、必ずRLSを有効化し、適切なポリシーを設定すること。
特に `user_id` を持つテーブルは `auth.uid() = user_id` のポリシーが必須。
