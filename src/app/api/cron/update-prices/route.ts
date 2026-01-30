import { NextRequest, NextResponse } from 'next/server';
import { updateMasterStockPrices } from '@/app/actions/stockActions';

export const dynamic = 'force-dynamic'; // Ensure not cached

export async function GET(request: NextRequest) {
    // 1. Authorization Check
    const authHeader = request.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse Mode
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') === 'retry' ? 'retry' : 'full';

    // 3. Execute Update
    try {
        const result = await updateMasterStockPrices(mode);
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
