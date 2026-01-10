
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
export const loadCSV = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const keywords = ['銘柄', 'コード', '取得', '数量', '口座', '特定', 'NISA'];

        // Helper to count keyword occurrences
        const scoreContent = (text: string) => {
            return keywords.reduce((acc, output) => acc + (text.includes(output) ? 1 : 0), 0);
        };

        const readerSJIS = new FileReader();
        const readerUTF8 = new FileReader();

        let contentSJIS = '';
        let contentUTF8 = '';
        let finished = 0;

        const checkAndResolve = () => {
            finished++;
            if (finished < 2) return;

            const scoreSJIS = scoreContent(contentSJIS);
            const scoreUTF8 = scoreContent(contentUTF8);

            console.log(`Encoding Scores - SJIS: ${scoreSJIS}, UTF8: ${scoreUTF8}`);

            if (scoreSJIS >= scoreUTF8 && scoreSJIS > 0) {
                console.log("Selected: Shift_JIS");
                resolve(contentSJIS);
            } else {
                console.log("Selected: UTF-8");
                if (contentUTF8.charCodeAt(0) === 0xFEFF) {
                    contentUTF8 = contentUTF8.slice(1);
                }
                resolve(contentUTF8);
            }
        };

        readerSJIS.onload = (e) => {
            contentSJIS = e.target?.result as string || '';
            checkAndResolve();
        };
        readerUTF8.onload = (e) => {
            contentUTF8 = e.target?.result as string || '';
            checkAndResolve();
        };

        readerSJIS.onerror = () => reject(readerSJIS.error);
        readerUTF8.onerror = () => reject(readerUTF8.error);

        readerSJIS.readAsText(file, 'Shift_JIS');
        readerUTF8.readAsText(file, 'UTF-8');
    });
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
            source: ['SBI'],
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
            source: ['Rakuten'],
            accountType
        });
    }

    return holdings;
};
