-- =====================================================
-- RLS ハードニング (2026-07-02)
--
-- 目的:
--   1. profiles: 認証ユーザーが is_vip / subscription_status を自己更新して
--      課金（プレミアム）を不正回避できる穴を塞ぐ。
--   2. stocks:  全ユーザー共通マスタへの書き込みを service_role のみに限定する
--      （2026-02-11 に本番で手動修正した内容をマイグレーションとして正式化）。
--   3. holdings: 個人データのため、本人のみアクセス可能なポリシーを明文化する。
--
-- 本ファイルは冪等（DROP POLICY IF EXISTS → CREATE）。既存の本番状態と
-- 一致させることを意図しており、正常系の動作は変更しない。
-- 書き込みが必要なサーバー処理はすべて service_role 経由（RLSバイパス）。
-- =====================================================


-- -----------------------------------------------------
-- 1. profiles: 権限昇格（課金回避）の防止
-- -----------------------------------------------------
-- RLSポリシーではカラム単位の制限ができないため、「自分の行なら更新可」の
-- ポリシーが残っていると is_vip / subscription_status を直接書き換えられる。
-- profiles の更新は service_role（決済Webhook等）でのみ行うため、
-- authenticated 向けの UPDATE ポリシーを削除する（＝ RLS default deny で更新不可）。
DROP POLICY IF EXISTS "Users can update own profile (limited)" ON public.profiles;

-- SELECT（自分のプロフィール参照）は維持。存在しない場合に備えて再作成。
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- 防御の多層化: authenticated からテーブルレベルの UPDATE 権限自体を剥奪する。
-- （PostgreSQLではテーブルレベルUPDATE権限があるとカラム単位のREVOKEが無効化されるため、
--  テーブルレベルで剥奪する。profiles の更新は service_role のみが行うので影響なし。
--  RLSポリシーが将来誤って追加されても、この剥奪により書き換えは阻止される。）
REVOKE UPDATE ON public.profiles FROM authenticated;


-- -----------------------------------------------------
-- 2. stocks: 書き込みは service_role のみ、authenticated は読み取り専用
-- -----------------------------------------------------
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;

-- 旧: FOR ALL TO authenticated USING(true) という危険なポリシーを除去
DROP POLICY IF EXISTS "Allow insert/update access to all authenticated users" ON public.stocks;
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.stocks;
DROP POLICY IF EXISTS "authenticated_read_stocks" ON public.stocks;

-- 読み取りのみ許可（書き込みポリシーは作らない = service_role のみ書き込み可能）
CREATE POLICY "authenticated_read_stocks"
    ON public.stocks FOR SELECT
    TO authenticated
    USING (true);


-- -----------------------------------------------------
-- 3. holdings: 本人のみアクセス可（ソース・オブ・トゥルースの明文化）
-- -----------------------------------------------------
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own holdings" ON public.holdings;
CREATE POLICY "Users can view own holdings"
    ON public.holdings FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own holdings" ON public.holdings;
CREATE POLICY "Users can insert own holdings"
    ON public.holdings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own holdings" ON public.holdings;
CREATE POLICY "Users can update own holdings"
    ON public.holdings FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own holdings" ON public.holdings;
CREATE POLICY "Users can delete own holdings"
    ON public.holdings FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
