
import { Holding, AccountType } from '@/lib/mockData';

/**
 * Utility to parse formatted number strings (e.g. "1,200", "-") to number.
 * Returns 0 for invalid inputs or "-".
 */
const parseNumber = (val: string | undefined): number => {
    if (!val) return 0;
    // Remove commas, quotes, spaces
    const cleanVal = val.replace(/,/g, '').replace(/"/g, '').trim();
    if (cleanVal === '-' || cleanVal === '') return 0;
    const num = parseFloat(cleanVal);
    return isNaN(num) ? 0 : num;
};

/**
 * Regex-based CSV Line Parser
 * Handles: "1,200", "Stock Name", NormalValue
 */
const parseCSVLine = (line: string): string[] => {
    // Regex explanation:
    // ("(?:[^"]|"")*"|[^,]+)   <- matches quoted string OR non-comma sequence
    // But standard JS split regex is tricky. 
    // Let's use a robust matching pattern for CSV tokens.
    // Pattern: /(".*?"|[^",\s]+)(?=\s*,|\s*$)/g is suggested but simple.
    // Better standard CSV regex: /(".*?"|[^,]+)(?=\s*,|\s*$)/g 

    // NOTE: This regex simply finds token-like things.
    // Matches:
    // 1. Quoted string: "..."
    // 2. Non-quoted string: anything except comma
    const matches = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g);

    if (!matches) {
        // Fallback for empty lines or simple splits if no match found (rare)
        return line.split(',').map(s => s.trim());
    }

    return matches.map(m => {
        // Remove surrounding quotes and internal commas for numbers (if we want to clean raw value)
        // But here we return the raw CELL value. Cleaning happens later or here.
        // User instruction: "Make sure to remove quotes and commas to numberize"
        // Let's return the cleaned string representation of the cell.

        // 1. Remove surrounding whitespace
        let cell = m.trim();
        // 2. Remove surrounding quotes
        if (cell.startsWith('"') && cell.endsWith('"')) {
            cell = cell.slice(1, -1);
        }
        // 3. (Optional) We don't remove commas HERE inside text, e.g. "Company, Inc".
        // But for numbers "1,200" we will remove them in parseNumber.

        return cell.trim();
    });
};

/**
 * Robust CSV Loader with Scoring
 * Reads file as both Shift_JIS and UTF-8, counts keywords, and picks the best match.
 */
/**
 * Robust CSV Loader with Strict Encoding Detection
 * Reads file as ArrayBuffer and detects encoding based on keywords.
 */
export const loadCSV = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const buffer = e.target?.result as ArrayBuffer;

                // 1. Try UTF-8 first
                const decoderUTF8 = new TextDecoder('utf-8');
                const contentUTF8 = decoderUTF8.decode(buffer);

                // Keywords to identify valid content (SBI, Rakuten, or Analysis data)
                const keywords = [
                    "ランク",
                    "総合スコア",
                    "保有数量",
                    "国内株式",
                    "口座",
                    "銘柄コード",
                    "取得単価",
                    "現在値",
                    "円貨入出金明細",
                    "入出金日",
                    "利金・配当金",
                    "受渡日",
                    "受取額",
                ];
                const hasUtf8Keywords = keywords.some(k => contentUTF8.includes(k));

                console.log("【CSV判定】UTF-8キーワード検知:", hasUtf8Keywords);

                if (hasUtf8Keywords) {
                    console.log("【CSV判定】決定エンコーディング: UTF-8");
                    // Remove BOM if present
                    const finalContent = contentUTF8.charCodeAt(0) === 0xFEFF ? contentUTF8.slice(1) : contentUTF8;
                    resolve(finalContent);
                } else {
                    console.log("【CSV判定】決定エンコーディング: Shift-JIS");
                    // Fallback to Shift-JIS (common for Japanese CSVs)
                    const decoderSJIS = new TextDecoder('sjis');
                    resolve(decoderSJIS.decode(buffer));
                }
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => reject(reader.error);

        // Read as ArrayBuffer to allow manual decoding
        reader.readAsArrayBuffer(file);
    });
};

export type DividendMarket = 'JP' | 'US';

export type ImportedDividendPayment = {
    broker: 'SBI';
    paymentDate: string;
    stockName: string;
    /** 受取額（円・税引後）。海外分もSBIの円換算額をそのまま使う。 */
    amount: number;
    taxCategory: 'NISA' | 'Taxable' | 'Unknown';
    sourceFingerprint: string;
    market?: DividendMarket;
    /** 受取額の外貨表記（海外分でCSVに含まれる場合のみ） */
    currency?: string;
    amountForeign?: number;
    ticker?: string;
    quantity?: number;
    accountLabel?: string;
};

const normalizeText = (value: string): string => value
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeDividendStockName = (description: string): string => normalizeText(description)
    .replace(/^株式配当金/g, '')
    .replace(/（NISA：非課税）/g, '')
    .replace(/\(NISA：非課税\)/g, '')
    .trim();

const createDividendFingerprint = (payment: Omit<ImportedDividendPayment, 'sourceFingerprint'>, description: string): string => [
    payment.broker,
    payment.paymentDate,
    payment.stockName,
    payment.amount,
    payment.taxCategory,
    normalizeText(description),
].join('|');

/**
 * Parse SBI deposit/withdrawal detail CSV and extract dividend payments only.
 *
 * 対象:
 * - 取引 = 入金
 * - 区分 = 利金・配当金
 *
 * 除外:
 * - ポイント、その他、クレカ・引落、出金
 */
export const parseSBIDividendPaymentCSV = (csvContent: string): ImportedDividendPayment[] => {
    const lines = csvContent.split(/\r?\n/);
    const payments: ImportedDividendPayment[] = [];

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('入出金日') && line.includes('取引') && line.includes('区分') && line.includes('入金額')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        console.error("SBI dividend payment CSV header not found");
        return [];
    }

    const headers = parseCSVLine(lines[headerIndex]);
    const getIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h === k || h.includes(k)));

    const colIndices = {
        paymentDate: getIndex(['入出金日']),
        transaction: getIndex(['取引']),
        category: getIndex(['区分']),
        description: getIndex(['摘要', '銘柄名']),
        depositAmount: getIndex(['入金額']),
    };

    if (Object.values(colIndices).some(index => index < 0)) {
        console.error("SBI dividend payment CSV required columns not found", colIndices);
        return [];
    }

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = parseCSVLine(line);
        const transaction = normalizeText(cells[colIndices.transaction] || '');
        const category = normalizeText(cells[colIndices.category] || '');

        if (transaction !== '入金') continue;
        if (category !== '利金・配当金') continue;

        const rawDate = normalizeText(cells[colIndices.paymentDate] || '');
        const description = normalizeText(cells[colIndices.description] || '');
        const amount = parseNumber(cells[colIndices.depositAmount]);
        const stockName = normalizeDividendStockName(description);

        if (!rawDate || !stockName || amount <= 0) continue;

        const dateParts = rawDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (!dateParts) continue;
        const [, year, month, day] = dateParts;
        const paymentDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        const paymentWithoutFingerprint = {
            broker: 'SBI' as const,
            paymentDate,
            stockName,
            amount,
            taxCategory: description.includes('NISA') ? 'NISA' as const : 'Taxable' as const,
        };

        payments.push({
            ...paymentWithoutFingerprint,
            sourceFingerprint: createDividendFingerprint(paymentWithoutFingerprint, description),
        });
    }

    return payments;
};

/**
 * Parse SBI Securities CSV Export
 */
export const parseSBICSV = (csvContent: string): Holding[] => {
    const lines = csvContent.split(/\r?\n/);
    const holdings: Holding[] = [];

    // Find header
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('銘柄（コード）')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        console.error("SBI CSV Header not found");
        return [];
    }

    // Parse Header Line using strict tokenizer
    const headerLine = lines[headerIndex];
    const headers = parseCSVLine(headerLine);

    // Fixed mapping for SBI (based on standard export)
    // We search the headers array we just parsed
    // Note: SBI headers usually: "銘柄（コード）", "保有株数", etc.
    const getIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));

    const colIndices = {
        codeName: getIndex(['銘柄（コード）']),
        quantity: getIndex(['数量', '保有株数']),
        acquisitionPrice: getIndex(['取得単価']),
        currentPrice: getIndex(['現在値']),
        gainLoss: getIndex(['損益', '評価損益']),
    };

    let currentAccountType: AccountType = 'Specific'; // Default

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Context Switching (Section Headers usually just have text or simple format)
        if (line.includes('特定預り')) {
            currentAccountType = 'Specific'; continue;
        }
        if (line.includes('NISA預り') || line.includes('つみたて')) {
            currentAccountType = 'NISA'; continue;
        }
        if (line.includes('一般預り')) {
            currentAccountType = 'General'; continue;
        }

        // Garbage Filter
        if (["合計", "株式", "資産", "参考", "投資"].some(k => line.startsWith(k))) continue;
        // Skip Header row itself
        if (line.includes('銘柄（コード）')) continue;

        // Parse Row
        const cells = parseCSVLine(line);
        if (cells.length < 5) continue;

        // Code extraction "3817 ＳＲＡＨＤ"
        const codeNameRaw = cells[colIndices.codeName];
        if (!codeNameRaw) continue;

        const parts = codeNameRaw.split(' ');
        const code = parts[0];
        const name = parts.slice(1).join(' ') || code;

        // Strict Code Check
        if (!code || isNaN(parseInt(code)) || code.length < 4 || code.length > 5) continue;

        holdings.push({
            code,
            name,
            quantity: parseNumber(cells[colIndices.quantity]),
            acquisitionPrice: parseNumber(cells[colIndices.acquisitionPrice]),
            price: parseNumber(cells[colIndices.currentPrice]),
            totalGainLoss: parseNumber(cells[colIndices.gainLoss]),
            dividendPerShare: 0,
            sector: 'その他',
            sector33: '',
            source: 'SBI',
            accountType: currentAccountType
        });
    }

    return holdings;
};

/**
 * Parse Rakuten Securities CSV Export
 */
export const parseRakutenCSV = (csvContent: string): Holding[] => {
    const lines = csvContent.split(/\r?\n/);
    const holdings: Holding[] = [];

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Relaxed Header Matching: "銘柄" AND ("数量" OR "取得") to be robust
        if (
            line.includes('銘柄') && (line.includes('数量') || line.includes('取得') || line.includes('コード'))
        ) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        console.error("Rakuten CSV Header not found. Scanned lines:", lines.slice(0, 10));
        return [];
    }

    // Dynamic Column Mapping
    const headers = parseCSVLine(lines[headerIndex]);
    const getIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h === k || h.includes(k)));

    const colIndices = {
        code: getIndex(['銘柄コード', 'コード']),
        name: getIndex(['銘柄名', 'ファンド名']),
        quantity: getIndex(['保有数量', '保有株数', '数量']),
        acquisitionPrice: getIndex(['平均取得価額', '取得単価']),
        currentPrice: getIndex(['現在値', '時価', '株価']),
        // Rakuten often uses '評価損益' or '損益'
        gainLoss: getIndex(['評価損益', '損益']),
        account: getIndex(['口座', '口座区分']),
    };

    console.log("Rakuten Indices:", colIndices);

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Garbage Filter
        if (["合計", "株式", "資産", "参考", "投資"].some(k => line.startsWith(k))) continue;

        const cells = parseCSVLine(line);
        if (cells.length < 3) continue;

        // Code
        let code = cells[colIndices.code];
        // Clean "9432 東証" -> "9432"
        if (code) code = code.split(' ')[0];

        // Strict Code Check
        if (!code || isNaN(parseInt(code)) || code.length < 4 || code.length > 5) continue;

        // Values
        const quantity = parseNumber(cells[colIndices.quantity]);
        const acquisitionPrice = parseNumber(cells[colIndices.acquisitionPrice]);
        const price = parseNumber(cells[colIndices.currentPrice]);
        const totalGainLoss = parseNumber(cells[colIndices.gainLoss]);
        const name = cells[colIndices.name] || code;

        // Account Type
        let accountType: AccountType = 'Specific';
        if (colIndices.account !== -1) {
            const accVal = cells[colIndices.account];
            if (accVal.includes('一般')) accountType = 'General';
            else if (accVal.includes('NISA') || accVal.includes('つみたて')) accountType = 'NISA';
            else if (accVal.includes('特定')) accountType = 'Specific';
        }

        holdings.push({
            code,
            name,
            quantity,
            price,
            acquisitionPrice,
            totalGainLoss,
            dividendPerShare: 0,
            sector: 'その他',
            sector33: '',
            source: 'Rakuten',
            accountType
        });
    }

    return holdings;
};

/**
 * Parse Analysis Data CSV
 * Headers: "証券コード", "ランク", "総合スコア", "ランク詳細", "警告・注意フラグ", "分析日時"
 */
export const parseAnalysisCSV = (csvContent: string): Partial<Holding>[] => {
    const lines = csvContent.split(/\r?\n/);
    const updates: Partial<Holding>[] = [];

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('証券コード') && line.includes('ランク') && line.includes('総合スコア')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        console.error("Analysis CSV Header not found");
        return [];
    }

    const headers = parseCSVLine(lines[headerIndex]);
    const getIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h === k || h.includes(k)));

    const colIndices = {
        code: getIndex(['証券コード', 'code']),
        rank: getIndex(['ランク', 'ir_rank']),
        score: getIndex(['総合スコア', 'ir_score']),
        detail: getIndex(['ランク詳細', 'ir_detail']),
        flag: getIndex(['警告・注意フラグ', 'ir_flag']),
        date: getIndex(['分析日時', 'ir_date', 'date']),
    };

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = parseCSVLine(line);
        if (cells.length < 2) continue;

        const codeRaw = cells[colIndices.code];
        if (!codeRaw) continue;

        // Clean code (e.g. "9432" or "9432.0" -> "9432")
        const code = codeRaw.split('.')[0].trim();

        if (!code || isNaN(parseInt(code))) continue;

        const rank = cells[colIndices.rank] || '';
        const score = parseNumber(cells[colIndices.score]);
        const detail = cells[colIndices.detail] || '';
        const flag = cells[colIndices.flag] || '';
        const date = cells[colIndices.date] || '';

        updates.push({
            code,
            ir_rank: rank,
            ir_score: score,
            ir_detail: detail,
            ir_flag: flag,
            ir_date: date,
        });
    }

    return updates;
};

/* ------------------------------------------------------------------ *
 * 海外（米国ETFなど）の取り込み
 * ------------------------------------------------------------------ */

/** 商品名 → 通貨。SBIの「配当金・分配金」CSVの商品列から判定する。 */
const PRODUCT_CURRENCY: Record<string, string> = {
    '米国株式': 'USD',
    '中国株式': 'HKD',
    '韓国株式': 'KRW',
    'ロシア株式': 'RUB',
    'ベトナム株式': 'VND',
    'インドネシア株式': 'IDR',
    'シンガポール株式': 'SGD',
    'タイ株式': 'THB',
    'マレーシア株式': 'MYR',
};

/** 銘柄名の末尾に付くティッカーを抜き出す。例: "バンガード 米国高配当株式ETF VYM" → "VYM" */
const extractTicker = (stockName: string): string => {
    const tokens = normalizeText(stockName).split(' ').filter(Boolean);
    for (let i = tokens.length - 1; i >= 0; i--) {
        if (/^[A-Z][A-Z0-9.-]{0,5}$/.test(tokens[i])) return tokens[i];
    }
    return '';
};

/**
 * 取り込もうとしている配当金CSVがどちらの形式かを判定する。
 * - 'JP': 円貨入出金明細（国内株式の配当金が入金として並ぶ）
 * - 'US': 配当金・分配金（海外株式。受取額が円換算済みで並ぶ）
 */
export const detectDividendCsvKind = (csvContent: string): DividendMarket | null => {
    if (csvContent.includes('入出金日') && csvContent.includes('入金額')) return 'JP';
    if (csvContent.includes('受渡日') && csvContent.includes('銘柄名')) return 'US';
    return null;
};

/**
 * SBIの「配当金・分配金」CSV（海外株式）から受取実績を取り出す。
 *
 * 明細部のヘッダー例:
 * "受渡日","口座","商品","銘柄名","数量","受取額(税引後・円)"
 *
 * 国内株式の行は円貨入出金明細側で取り込むため、ここでは除外して二重計上を防ぐ。
 */
export const parseSBIForeignDividendCSV = (csvContent: string): ImportedDividendPayment[] => {
    const lines = csvContent.split(/\r?\n/);
    const payments: ImportedDividendPayment[] = [];

    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('受渡日') && lines[i].includes('銘柄名')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex === -1) {
        console.error('SBI foreign dividend CSV header not found');
        return [];
    }

    const headers = parseCSVLine(lines[headerIndex]).map(normalizeText);
    const getIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));

    const colIndices = {
        paymentDate: getIndex(['受渡日']),
        account: getIndex(['口座']),
        product: getIndex(['商品']),
        stockName: getIndex(['銘柄名']),
        quantity: getIndex(['数量']),
        amountJpy: headers.findIndex(h => h.includes('受取額') && h.includes('円')),
        amountForeign: headers.findIndex(h => h.includes('受取額') && /USD|ドル|外貨/.test(h)),
    };

    if (colIndices.paymentDate < 0 || colIndices.stockName < 0 || colIndices.amountJpy < 0) {
        console.error('SBI foreign dividend CSV required columns not found', colIndices);
        return [];
    }

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = parseCSVLine(line);
        const rawDate = normalizeText(cells[colIndices.paymentDate] || '');
        const dateParts = rawDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
        if (!dateParts) continue;

        const product = normalizeText(cells[colIndices.product] || '');
        // 国内株式は円貨入出金明細で取り込むため対象外
        if (product.includes('国内')) continue;

        const stockName = normalizeText(cells[colIndices.stockName] || '');
        const amount = parseNumber(cells[colIndices.amountJpy]);
        if (!stockName || amount <= 0) continue;

        const [, year, month, day] = dateParts;
        const paymentDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        const accountLabel = normalizeText(cells[colIndices.account] || '');
        const amountForeign = colIndices.amountForeign >= 0
            ? parseNumber(cells[colIndices.amountForeign])
            : 0;

        payments.push({
            broker: 'SBI',
            market: 'US',
            paymentDate,
            stockName,
            amount: Math.round(amount * 100) / 100,
            taxCategory: accountLabel.includes('NISA') ? 'NISA' : 'Taxable',
            currency: PRODUCT_CURRENCY[product] || 'USD',
            amountForeign: amountForeign > 0 ? amountForeign : undefined,
            ticker: extractTicker(stockName),
            quantity: parseNumber(cells[colIndices.quantity]) || undefined,
            accountLabel: accountLabel || undefined,
            sourceFingerprint: [
                'SBI',
                'US',
                paymentDate,
                stockName,
                Math.round(amount * 100) / 100,
                accountLabel,
                product,
            ].join('|'),
        });
    }

    return payments;
};

/**
 * SBIの「外貨建商品 保有証券」画面をコピーして貼り付けたテキストを読み取る。
 *
 * 画面をそのままコピーすると、1セル1行（またはタブ区切り）のテキストになる。
 * 列の順番に依存しすぎないよう、ティッカー行を区切りにして
 * ブロックごとに「USD表記の値」「円表記の値」「素の数値」を順番に拾う。
 *
 * 1ブロックの並び（SBIの標準表示）:
 *   現在値USD / 現在値円 / 保有数量 / (売却注文中) / 取得単価USD / 取得単価円 /
 *   取得金額USD / 取得金額円 / 評価額USD / 評価額円 / 評価損益USD / 評価損益円
 */
const OVERSEAS_TICKER_LINE = /^([A-Z][A-Z0-9.-]{0,5})\s*(NYSE Arca|NYSE American|NYSE|NASDAQ|AMEX|ARCA|BATS|CBOE|OTC)$/i;
const OVERSEAS_TICKER_ONLY = /^[A-Z][A-Z0-9.-]{0,5}$/;
const FOREIGN_VALUE = /^([+-]?[\d,]+(?:\.\d+)?)\s*(USD|ドル|米ドル)$/;
const YEN_VALUE = /^([+-]?[\d,]+(?:\.\d+)?)\s*(円|JPY)$/;
const PLAIN_NUMBER = /^[+-]?[\d,]+(?:\.\d+)?$/;

/** 表の見出しなど、銘柄名として採用してはいけない語 */
const OVERSEAS_HEADER_WORDS = new Set([
    '銘柄', '現在値', '円換算額', '保有数量', '取得単価', '取得金額',
    '外貨建評価額', '円換算評価額', '外貨建評価損益', '円換算評価損益',
    '金額', '%', '取引', '現買', '現売', '積立', '売却注文中', '売却',
    '特定口座', 'NISA口座', '一般口座', '口座',
]);

const NON_TICKER_WORDS = new Set(['USD', 'JPY', 'NISA', 'ETF', 'SBI', 'NYSE', 'NASDAQ']);

export type ParsedOverseasHolding = {
    ticker: string;
    name: string;
    exchange: string;
    currency: string;
    accountType: '特定' | 'NISA' | '一般';
    quantity: number;
    priceForeign: number;
    priceJpy: number;
    acquisitionPriceForeign: number;
    acquisitionPriceJpy: number;
    valuationForeign: number;
    valuationJpy: number;
    gainLossForeign: number;
    gainLossJpy: number;
    fxRate: number;
};

export type OverseasPasteResult = {
    holdings: ParsedOverseasHolding[];
    warnings: string[];
};

const detectAccountType = (token: string): '特定' | 'NISA' | '一般' | null => {
    if (token.includes('NISA') || token.includes('ＮＩＳＡ')) return 'NISA';
    if (token.includes('特定')) return '特定';
    if (token.includes('一般')) return '一般';
    return null;
};

export const parseSBIOverseasHoldingsPaste = (rawText: string): OverseasPasteResult => {
    const tokens = rawText
        .replace(/　/g, ' ')
        .split(/[\r\n\t]+/)
        .map(token => token.trim())
        .filter(Boolean);

    type Block = {
        ticker: string;
        exchange: string;
        name: string;
        accountType: '特定' | 'NISA' | '一般';
        foreign: number[];
        yen: number[];
        plain: number[];
    };

    const blocks: Block[] = [];
    const warnings: string[] = [];
    let currentAccount: '特定' | 'NISA' | '一般' = '特定';
    let sawAccountLabel = false;
    let current: Block | null = null;

    const toNumber = (value: string) => parseNumber(value);

    tokens.forEach((token, index) => {
        const tickerMatch = token.match(OVERSEAS_TICKER_LINE);
        const isBareTicker = !tickerMatch
            && OVERSEAS_TICKER_ONLY.test(token)
            && !NON_TICKER_WORDS.has(token);

        if (tickerMatch || isBareTicker) {
            const previous = tokens[index - 1] || '';
            const usablePreviousName = previous
                && !OVERSEAS_HEADER_WORDS.has(previous)
                && !PLAIN_NUMBER.test(previous)
                && !FOREIGN_VALUE.test(previous)
                && !YEN_VALUE.test(previous)
                && !/^\(.*\)$/.test(previous);

            current = {
                ticker: (tickerMatch ? tickerMatch[1] : token).toUpperCase(),
                exchange: tickerMatch ? tickerMatch[2] : '',
                name: usablePreviousName ? previous : (tickerMatch ? tickerMatch[1] : token).toUpperCase(),
                accountType: currentAccount,
                foreign: [],
                yen: [],
                plain: [],
            };
            blocks.push(current);
            return;
        }

        const accountType = detectAccountType(token);
        if (accountType && (token.includes('口座') || token.length <= 12)) {
            // 口座の見出し行。以降のブロックに適用する。
            currentAccount = accountType;
            sawAccountLabel = true;
            if (current) current.accountType = accountType;
            return;
        }

        if (!current) return;
        if (/^\(.*\)$/.test(token)) return; // (0) などの売却注文中は使わない

        const foreignMatch = token.match(FOREIGN_VALUE);
        if (foreignMatch) {
            current.foreign.push(toNumber(foreignMatch[1]));
            return;
        }

        const yenMatch = token.match(YEN_VALUE);
        if (yenMatch) {
            current.yen.push(toNumber(yenMatch[1]));
            return;
        }

        if (PLAIN_NUMBER.test(token)) {
            current.plain.push(toNumber(token));
        }
    });

    const holdings: ParsedOverseasHolding[] = [];

    blocks.forEach(block => {
        const quantity = block.plain[0] || 0;
        const priceForeign = block.foreign[0] || 0;
        const priceJpy = block.yen[0] || 0;

        if (quantity <= 0 || priceForeign <= 0) {
            warnings.push(`${block.ticker}: 保有数量か現在値を読み取れなかったため取り込み対象から外しました`);
            return;
        }

        const acquisitionPriceForeign = block.foreign[1] || 0;
        const acquisitionPriceJpy = block.yen[1] || 0;
        const valuationForeign = block.foreign[3] || priceForeign * quantity;
        const valuationJpy = block.yen[3] || 0;
        const gainLossForeign = block.foreign[4] || (valuationForeign - acquisitionPriceForeign * quantity);
        const gainLossJpy = block.yen[4] || 0;

        // 円換算額から実効レートを逆算する（SBIが実際に使ったレート）
        let fxRate = 0;
        if (valuationForeign > 0 && valuationJpy > 0) fxRate = valuationJpy / valuationForeign;
        else if (priceForeign > 0 && priceJpy > 0) fxRate = priceJpy / priceForeign;

        if (fxRate <= 0) {
            warnings.push(`${block.ticker}: 円換算額が見つからないため、為替レートを手入力してください`);
        }

        holdings.push({
            ticker: block.ticker,
            name: block.name,
            exchange: block.exchange,
            currency: 'USD',
            accountType: block.accountType,
            quantity,
            priceForeign,
            priceJpy: priceJpy || (fxRate > 0 ? priceForeign * fxRate : 0),
            acquisitionPriceForeign,
            acquisitionPriceJpy: acquisitionPriceJpy || (fxRate > 0 ? acquisitionPriceForeign * fxRate : 0),
            valuationForeign,
            valuationJpy: valuationJpy || (fxRate > 0 ? valuationForeign * fxRate : 0),
            gainLossForeign,
            gainLossJpy: gainLossJpy || (fxRate > 0 ? gainLossForeign * fxRate : 0),
            fxRate,
        });
    });

    if (holdings.length === 0 && blocks.length === 0) {
        warnings.push('銘柄を1件も読み取れませんでした。SBIの「外貨建商品 保有証券」の表を、見出しの行ごとコピーして貼り付けてください。');
    }

    if (!sawAccountLabel && holdings.length > 0) {
        warnings.push('口座区分（特定・NISA）が読み取れなかったため、すべて「特定」として扱います。必要に応じて変更してください。');
    }

    return { holdings, warnings };
};
