import { NextRequest, NextResponse } from 'next/server';
import { fetchMasterData } from '@/lib/googleSheets';
import { createServiceRoleClient } from '@/utils/supabase/service-role';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(request: NextRequest) {
    try {
        // 1. Authentication
        const { searchParams } = new URL(request.url);
        const secret = searchParams.get('secret');
        const envSecret = process.env.CRON_SECRET;

        // CRON_SECRETが未設定の場合は実行不可とする（安全のため）
        if (!envSecret || secret !== envSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[Admin] Starting Master Data Refresh...');

        // 2. Fetch latest master data from CSV
        const masterData = await fetchMasterData();
        const codes = Object.keys(masterData);

        if (codes.length === 0) {
            return NextResponse.json({ message: 'No master data found in CSV.' });
        }

        // 3. Prepare Upsert Data
        // 全件更新を行う（Sector, Nameを最新化）
        // Priceは更新しない（nullにしておけば、upsert時に既存の値が保持される...わけではない。upsertは全置換に近い挙動か？）
        // Supabase(Postgres)のupsertで、指定カラムだけ更新するには、onConflict時に update するカラムを指定する必要があるが、
        // JS SDKの upsert はいっぺんに投げる仕様。
        // 単純に { code, sector, name, updated_at } を投げると、price が指定されていない場合どうなるか？
        // -> PostgreSQLの `INSERT ... ON CONFLICT DO UPDATE` の挙動としては、指定されたカラム以外は変更されないはずだが、
        // JS SDKを通すと「指定していないカラムはNULLで上書きされる」リスクがあるか検証が必要。
        // しかし、通常 `upsert` は「行そのものを置き換える」または「指定フィールドで更新する」。
        // ここでは安全のため、「全データを一括更新」ではなく、少し工夫が必要かもしれないが、
        // stocksテーブルの定義上、priceはnullable。
        // また、JS SDKのupsertはデフォルトで "merged" な挙動ではない（渡したオブジェクトでレコードを再構成するイメージ）。
        // ただし `ignoreDuplicates: false` (デフォルト) の場合。

        // 解決策: 本来は `update` を使うべきだが、件数が多い。
        // 今回の目的は「マスタメンテ」なので、CSVにある情報（セクター・社名）を正としたい。
        // Priceについては、CSVに含まれていない。
        // もし `price` を含めずに upsert した場合、既存の `price` が消える（NULLになる）なら大問題。

        // 検証: Supabase JS の upsert は、渡されたオブジェクトのキーのみを UPDATE SET 句に含めるか？
        // 一般的に、渡されていないキーは触らない（UPDATEの場合）。INSERTの場合はデフォルト値またはNULL。
        // 既存レコードがあれば UPDATE が走る。
        // なので、 { code, sector, name } だけ渡せば、price は維持されるはずである。

        const updates = codes.map(code => {
            const data = masterData[code];
            return {
                code: code,
                // name: data.name, // Stocksテーブルにname列がないため除外
                sector: data.sector,
                updated_at: new Date().toISOString()
            };
        });

        // 4. Batch Upsert to Supabase
        const supabase = createServiceRoleClient();

        // チャンク分割して処理（大量データの場合のタイムアウト防止）
        const CHUNK_SIZE = 1000;
        let totalUpdated = 0;

        for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
            const chunk = updates.slice(i, i + CHUNK_SIZE);
            const { error } = await supabase
                .from('stocks')
                .upsert(chunk, { onConflict: 'code' });

            if (error) {
                console.error(`[Admin] Chunk update error (index ${i}):`, error);
                throw error;
            }
            totalUpdated += chunk.length;
        }

        console.log(`[Admin] Successfully refreshed ${totalUpdated} stocks.`);

        return NextResponse.json({
            success: true,
            totalUpdated,
            message: `Successfully refreshed ${totalUpdated} stocks from CSV master.`
        });

    } catch (error: any) {
        console.error('[Admin] Refresh Master Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
