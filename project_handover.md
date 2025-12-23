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
