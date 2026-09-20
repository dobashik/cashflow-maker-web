# Cashflow Maker Web - Project Handover Document

## 1. プロジェクト概要 (Project Overview)
**Cashflow Maker Web** は、配当金（不労所得）が生活費を賄っていく様子を視覚化し、資産形成のモチベーションを高めるためのポートフォリオ管理アプリケーションです。

*   **デザインコンセプト**: 「ディズニー・マジック・デザイン」
    *   ワクワクするようなアニメーションとリッチなビジュアルを採用。
    *   **メタファー**:
        *   **自由の塔 (Life Tower)**: 生活費の積み上げ（敵/攻略対象）。
        *   **魔法の水 (Magic Water)**: 配当金の総額。塔を浸していく（カバー率）。
        *   **保有株式の宝箱 (Treasure List)**: 資産を生み出す源泉（ポートフォリオ）。

## 2. 技術スタック & 設定 (Tech Stack)
*   **Framework**: Next.js 16 (App Router)
*   **Language**: TypeScript
*   **Styling**: Tailwind CSS v4 (configured via `src/app/globals.css`)
    *   `@theme` block is used for custom colors (`--color-background`, `--color-foreground`).
*   **Animation**: Framer Motion (`AnimatePresence`, `motion`, `useSpring`, `useTransform`)
*   **Charts**: Recharts (Pie Chart)
*   **Icons**: Lucide React
*   **Deployment**: Cloudflare Pages (`nodejs_compat`)

## 3. ディレクトリ構成と役割 (Directory Structure)
```
src/
├── app/
│   ├── layout.tsx       # グローバルレイアウト (フォント設定: Geist, Geist_Mono)
│   ├── page.tsx         # メインダッシュボード。各コンポーネントの配置とタイトルアニメーション。
│   └── globals.css      # Tailwind v4設定 (@import "tailwindcss"; @theme, @keyframes)
├── components/
│   ├── Header.tsx       # 固定ヘッダー。ロゴとアプリ名。
│   ├── DividendGame.tsx # 【中核機能】「生活費タワー」vs「配当金の水」のビジュアル化。
│   ├── PortfolioPie.tsx # セクター別ポートフォリオの円グラフ。
│   ├── HoldingsTable.tsx# 保有銘柄リスト。各銘柄のカード表示。
│   └── ui/              # 汎用UIコンポーネント (Buttonなど)。
└── lib/
    └── mockData.ts      # モックデータ定義 (EXPENSES, HOLDINGS) と計算ロジック。
```

## 4. 主要コンポーネント詳細 (Key Components)

### 4.1. DividendGame (`src/components/DividendGame.tsx`)
プロジェクトの顔となるコンポーネントです。
*   **機能**: 年間配当金（月換算）が、毎月の生活費をどれだけカバーしているかを視覚化します。
*   **左側 (Life Tower)**:
    *   `EXPENSES` データに基づいて積み木のようにブロックを積み上げます。
    *   `Framer Motion` の `staggerChildren` を使い、ブロックが降ってくるアニメーションを実装。
    *   各ブロックは生活費項目（家賃、食費など）を表します。
*   **右側 (Magic Water)**:
    *   配当金のカバー率（`coveragePercent`）に応じて水位が上昇します。
    *   SVGの波アニメーション (`animate-wave`) が常に動いています。
    *   数値カウンターは `useSpring` を使用して滑らかにカウントアップします。

### 4.2. PortfolioPie (`src/components/PortfolioPie.tsx`)
資産の配分状況を確認する円グラフです。
*   **機能**: セクター（業種）ごとの資産配分を表示。
*   **実装**:
    *   `Recharts` の `PieChart` を使用。
    *   中心に「総資産額」をオーバーレイ表示。
    *   グラフ全体が回転しながら出現するアニメーション。

### 4.3. HoldingsTable (`src/components/HoldingsTable.tsx`)
保有銘柄の詳細リストです。
*   **機能**: 銘柄コード、名称、株価、利回り、予想配当金を表示。
*   **実装**:
    *   テーブルではなく、カード形式のリストアイテム（グリッドレイアウト）として実装。
    *   各行が左からスライドインするアニメーション (`staggerChildren`).
    *   ホバー時に浮き上がるエフェクト。

## 5. データフロー (Data Flow)
現在は `src/lib/mockData.ts` 内の定数データを使用しています。

*   **EXPENSES**: 生活費項目の配列。`DividendGame` で使用。
*   **HOLDINGS**: 保有銘柄の配列。`PortfolioPie` (セクター集計) と `HoldingsTable` (リスト表示) で使用。
*   **計算**:
    *   `TOTAL_EXPENSES`: 生活費合計。
    *   `TOTAL_DIVIDENDS_ANNUAL`: 年間配当金合計。
    *   `MONTHLY_DIVIDEND`: 月間換算配当金 (年間 / 12)。

## 6. 今後の開発指針 (Next Steps)
開発を再開する際は、以下のステップが考えられます。

1.  **実データへの接続**: `mockData.ts` をAPI取得やデータベース連携（Supabase、Firestoreなど）に置き換える。
2.  **認証機能**: ユーザーごとにポートフォリオを保存するためのログイン機能実装（Clerk, NextAuthなど）。
3.  **編集機能**: UI上から生活費や保有銘柄を追加・編集・削除できるフォームの実装。
4.  **レスポンシブ調整**: モバイルビューでの体験向上（現在は基本対応済みだが、実機確認など）。

このドキュメントを参考に、魔法のような資産管理ツールの開発を進めてください！

## 7. 海外（米国ETFなど）対応 2026年9月

日本高配当株に加えて、米国ETFなどの海外高配当銘柄も管理できるようにした。

### 7.1. 取り込み経路
*   **保有銘柄**: SBI証券「外貨建商品 保有証券」の画面をコピーして貼り付ける。
    *   CSVが提供されていないため、画面の表をそのまま貼り付ける方式を採用。
    *   `parseSBIOverseasHoldingsPaste` (`src/utils/csvParser.ts`) がティッカー行を区切りとして、
        USD表記・円表記・素の数値を順番に拾う。列の並びが多少変わっても壊れにくい。
    *   為替レートは円換算額から逆算する（証券会社が実際に使ったレート）。外部APIは使わない。
*   **分配金**: SBI証券「配当金・分配金」CSV。`parseSBIForeignDividendCSV` が読み取る。
    *   受取額が円換算・税引後で入っているため、日本株（円貨入出金明細）と同じ基準で合算できる。
    *   国内株式の行は円貨入出金明細側で取り込むため除外し、二重計上を防ぐ。
    *   `detectDividendCsvKind` が2つのCSV形式を自動で見分けるため、取り込み口は1つで済む。

### 7.2. データ構造
*   `overseas_holdings` テーブル（`supabase/migrations/20260920_create_overseas_holdings.sql`）。
    日本株の `holdings` とは通貨・税制・取り込み経路が違うため分離した。
*   `dividend_payments` に `market` / `currency` / `amount_foreign` / `ticker` などを追加。
    海外の受取額は小数を含むため `amount` を `INTEGER` から `NUMERIC(14,2)` に変更している。

### 7.3. 画面
*   **保有株式リスト**: 「🇯🇵 日本株 / 🌎 海外ETF / 履歴」のタブ構成。
    海外タブは `OverseasHoldings.tsx`（貼り付け取り込み・分配金設定・削除）。
*   **配当金カバー率 (`DividendGame`)**: 水槽を2層にした。
    下が日本株（水色）、その上に海外分（金色）が後から注がれ、カウンターも2段階で上がる。
    色だけに頼らないよう、境目の光の線・上積みバッジ・金額の内訳チップを添えている。
*   1口あたりの年間分配金はユーザーが入力する。税引後の見込みは
    NISA口座なら米国10%のみ、その他は米国10%＋国内20.315%で計算する（`src/lib/overseas.ts`）。
