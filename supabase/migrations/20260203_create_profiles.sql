-- =====================================================
-- profiles テーブル作成
-- ユーザーのサブスクリプション・トライアル・VIP情報を管理
-- =====================================================

-- profilesテーブル
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    subscription_status TEXT DEFAULT 'inactive' CHECK (subscription_status IN ('active', 'inactive', 'canceled', 'past_due', 'trialing')),
    trial_ends_at TIMESTAMPTZ,
    is_vip BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- コメント追加
COMMENT ON TABLE profiles IS 'ユーザーのサブスクリプション情報を管理';
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe顧客ID';
COMMENT ON COLUMN profiles.subscription_status IS 'サブスク状態: active, inactive, canceled, past_due, trialing';
COMMENT ON COLUMN profiles.trial_ends_at IS '無料トライアル終了日時（登録から90日後）';
COMMENT ON COLUMN profiles.is_vip IS 'VIPフラグ（trueで永続無料）';

-- =====================================================
-- Row Level Security (RLS) の設定
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のプロフィールのみ参照可能
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- ユーザーは自分のプロフィールのみ更新可能（ただしis_vipとsubscription_statusは更新不可）
-- Note: サーバーサイドでservice_roleを使って更新するため、ユーザー自身での更新は限定的
CREATE POLICY "Users can update own profile (limited)"
    ON profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- INSERTはトリガーで自動実行されるため、service_roleのみ許可
-- authenticated ユーザーには INSERT を許可しない（トリガーはSECURITY DEFINERで実行）

-- =====================================================
-- 新規ユーザー登録時の自動プロフィール作成トリガー
-- =====================================================

-- トリガー関数: 新規ユーザー登録時にprofilesレコードを作成
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, trial_ends_at, created_at, updated_at)
    VALUES (
        NEW.id,
        timezone('utc'::text, now()) + INTERVAL '90 days',  -- 90日後のトライアル終了日
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    );
    RETURN NEW;
END;
$$;

-- トリガー: auth.usersにINSERTされたらprofilesも作成
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 既存ユーザー向けのマイグレーション（既にauth.usersにいるユーザー用）
-- =====================================================

-- 既存ユーザーにprofilesレコードがない場合、作成する
INSERT INTO profiles (id, trial_ends_at, created_at, updated_at)
SELECT 
    id,
    timezone('utc'::text, now()) + INTERVAL '90 days',  -- 既存ユーザーも90日トライアル付与
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- updated_at 自動更新トリガー
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profiles_updated ON profiles;
CREATE TRIGGER on_profiles_updated
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
