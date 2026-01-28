export type ExpenseBlock = {
    id: string;
    label: string;
    amount: number;
    color: string;
};

export type AccountType = string;

export type Holding = {
    code: string;
    name: string;
    quantity: number;
    price: number;
    dividendPerShare: number;
    sector: string;
    sector33: string;
    acquisitionPrice: number;
    totalGainLoss: number;
    source: string;
    accountType: AccountType;
    ir_rank?: string;
    ir_score?: number;
    ir_detail?: string;
    ir_flag?: string;
    ir_date?: string;
    dividendMonths?: number[]; // e.g. [3, 9]
};

export const EXPENSES: ExpenseBlock[] = [
    { id: 'rent', label: 'Rent', amount: 120000, color: 'bg-rose-400' },
    { id: 'food', label: 'Food', amount: 60000, color: 'bg-orange-400' },
    { id: 'util', label: 'Utility', amount: 25000, color: 'bg-yellow-400' },
    { id: 'phone', label: 'Phone', amount: 10000, color: 'bg-green-400' },
    { id: 'date', label: 'Date', amount: 40000, color: 'bg-pink-400' },
    { id: 'hobby', label: 'Hobby', amount: 45000, color: 'bg-purple-400' },
];

export const HOLDINGS: Holding[] = [
    // --- 通信・商社（主力） ---
    { code: "9433", name: "KDDI", price: 4500, quantity: 300, dividendPerShare: 140, sector: "情報・通信業", sector33: "情報・通信業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8058", name: "三菱商事", price: 3000, quantity: 400, dividendPerShare: 100, sector: "卸売業", sector33: "卸売業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8001", name: "伊藤忠商事", price: 6500, quantity: 200, dividendPerShare: 160, sector: "卸売業", sector33: "卸売業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "9432", name: "日本電信電話", price: 180, quantity: 6000, dividendPerShare: 5, sector: "情報・通信業", sector33: "情報・通信業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "9434", name: "ソフトバンク", price: 1900, quantity: 600, dividendPerShare: 86, sector: "情報・通信業", sector33: "情報・通信業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    // --- 金融（主力） ---
    { code: "8306", name: "三菱UFJ FG", price: 1400, quantity: 800, dividendPerShare: 55, sector: "銀行業", sector33: "銀行業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8316", name: "三井住友FG", price: 8500, quantity: 100, dividendPerShare: 270, sector: "銀行業", sector33: "銀行業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8411", name: "みずほFG", price: 2800, quantity: 400, dividendPerShare: 105, sector: "銀行業", sector33: "銀行業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8593", name: "三菱HCキャピタル", price: 1000, quantity: 1200, dividendPerShare: 40, sector: "その他金融業", sector33: "その他金融業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8766", name: "東京海上HD", price: 5300, quantity: 200, dividendPerShare: 159, sector: "保険業", sector33: "保険業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8725", name: "MS&AD", price: 2900, quantity: 400, dividendPerShare: 110, sector: "保険業", sector33: "保険業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8697", name: "日本取引所G", price: 3800, quantity: 300, dividendPerShare: 63, sector: "その他金融業", sector33: "その他金融業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8591", name: "オリックス", price: 3200, quantity: 400, dividendPerShare: 98, sector: "その他金融業", sector33: "その他金融業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    // --- 製造・建設 ---
    { code: "2914", name: "日本たばこ産業", price: 3900, quantity: 400, dividendPerShare: 194, sector: "食料品", sector33: "食料品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "6301", name: "コマツ", price: 4000, quantity: 300, dividendPerShare: 144, sector: "機械", sector33: "機械", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1928", name: "積水ハウス", price: 3400, quantity: 300, dividendPerShare: 125, sector: "建設業", sector33: "建設業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1925", name: "大和ハウス工業", price: 4200, quantity: 200, dividendPerShare: 140, sector: "建設業", sector33: "建設業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "5108", name: "ブリヂストン", price: 6300, quantity: 200, dividendPerShare: 210, sector: "ゴム製品", sector33: "ゴム製品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "7267", name: "本田技研工業", price: 1700, quantity: 600, dividendPerShare: 68, sector: "輸送用機器", sector33: "輸送用機器", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "5020", name: "ENEOS HD", price: 750, quantity: 1500, dividendPerShare: 22, sector: "石油・石炭製品", sector33: "石油・石炭製品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "5401", name: "日本製鉄", price: 3500, quantity: 300, dividendPerShare: 160, sector: "鉄鋼", sector33: "鉄鋼", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    // --- 化学・薬品 ---
    { code: "4063", name: "信越化学工業", price: 6000, quantity: 200, dividendPerShare: 100, sector: "化学", sector33: "化学", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4452", name: "花王", price: 5800, quantity: 200, dividendPerShare: 150, sector: "化学", sector33: "化学", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4503", name: "アステラス製薬", price: 1600, quantity: 700, dividendPerShare: 70, sector: "医薬品", sector33: "医薬品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4502", name: "武田薬品工業", price: 4200, quantity: 300, dividendPerShare: 196, sector: "医薬品", sector33: "医薬品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    // --- インフラ・その他 ---
    { code: "9503", name: "関西電力", price: 2300, quantity: 500, dividendPerShare: 50, sector: "電気・ガス業", sector33: "電気・ガス業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "9513", name: "電源開発", price: 2400, quantity: 400, dividendPerShare: 90, sector: "電気・ガス業", sector33: "電気・ガス業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "9104", name: "商船三井", price: 4800, quantity: 200, dividendPerShare: 180, sector: "海運業", sector33: "海運業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "9101", name: "日本郵船", price: 4500, quantity: 200, dividendPerShare: 130, sector: "海運業", sector33: "海運業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    // --- 分散投資枠（残り20銘柄） ---
    { code: "3289", name: "東急不動産HD", price: 1000, quantity: 1000, dividendPerShare: 35, sector: "不動産業", sector33: "不動産業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8801", name: "三井不動産", price: 1400, quantity: 700, dividendPerShare: 30, sector: "不動産業", sector33: "不動産業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "7751", name: "キヤノン", price: 4300, quantity: 300, dividendPerShare: 140, sector: "電気機器", sector33: "電気機器", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "8031", name: "三井物産", price: 7200, quantity: 100, dividendPerShare: 170, sector: "卸売業", sector33: "卸売業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4188", name: "三菱ケミカルG", price: 900, quantity: 1200, dividendPerShare: 32, sector: "化学", sector33: "化学", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "5201", name: "AGC", price: 5500, quantity: 200, dividendPerShare: 210, sector: "ガラス・土石", sector33: "ガラス・土石製品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "7272", name: "ヤマハ発動機", price: 1300, quantity: 800, dividendPerShare: 50, sector: "輸送用機器", sector33: "輸送用機器", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "3003", name: "ヒューリック", price: 1500, quantity: 800, dividendPerShare: 50, sector: "不動産業", sector33: "不動産業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1605", name: "INPEX", price: 2100, quantity: 600, dividendPerShare: 76, sector: "鉱業", sector33: "鉱業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1801", name: "大成建設", price: 5800, quantity: 200, dividendPerShare: 130, sector: "建設業", sector33: "建設業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1802", name: "大林組", price: 1800, quantity: 600, dividendPerShare: 72, sector: "建設業", sector33: "建設業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1803", name: "清水建設", price: 1000, quantity: 1000, dividendPerShare: 25, sector: "建設業", sector33: "建設業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "1812", name: "鹿島建設", price: 2800, quantity: 400, dividendPerShare: 70, sector: "建設業", sector33: "建設業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "2503", name: "キリンHD", price: 2100, quantity: 500, dividendPerShare: 71, sector: "食料品", sector33: "食料品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "2802", name: "味の素", price: 5500, quantity: 200, dividendPerShare: 78, sector: "食料品", sector33: "食料品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4005", name: "住友化学", price: 350, quantity: 3000, dividendPerShare: 12, sector: "化学", sector33: "化学", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4204", name: "積水化学工業", price: 2200, quantity: 500, dividendPerShare: 66, sector: "化学", sector33: "化学", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4911", name: "資生堂", price: 4000, quantity: 200, dividendPerShare: 60, sector: "化学", sector33: "化学", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "7974", name: "任天堂", price: 7800, quantity: 100, dividendPerShare: 180, sector: "その他製品", sector33: "その他製品", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' },
    { code: "4661", name: "オリエンタルランド", price: 4500, quantity: 100, dividendPerShare: 10, sector: "サービス業", sector33: "サービス業", acquisitionPrice: 0, totalGainLoss: 0, source: 'Sample', accountType: 'Specific' }
];

export const TOTAL_EXPENSES = EXPENSES.reduce((sum, item) => sum + item.amount, 0);
// Annual Dividend / 12 for monthly comparison?
// The block game usually compares Monthly Expenses vs Monthly Dividend Equivalent OR Annual vs Annual.
// Let's assume Annual for Dividends vs Annual Expenses? Or Monthly for "Rent/Food"?
// Rent is usually monthly. Let's convert Dividends to Monthly equivalent for the water level visuals or multiply Expenses by 12.
// Visualizing "Monthly Cashflow" is more "Cashflow Maker". 
// Let's settle on: Water Level = (Annual Dividend / 12) vs (Monthly Expenses).

export const TOTAL_DIVIDENDS_ANNUAL = HOLDINGS.reduce((sum, item) => sum + (item.quantity * item.dividendPerShare), 0);
export const MONTHLY_DIVIDEND = Math.floor(TOTAL_DIVIDENDS_ANNUAL / 12);

export const MONTHLY_DIVIDENDS_DATA = [
    { month: '1月', amount: 12000 },
    { month: '2月', amount: 35000 },
    { month: '3月', amount: 158000 }, // March often high
    { month: '4月', amount: 15000 },
    { month: '5月', amount: 42000 },
    { month: '6月', amount: 180000 }, // June often high
    { month: '7月', amount: 22000 },
    { month: '8月', amount: 38000 },
    { month: '9月', amount: 165000 }, // Sept often high
    { month: '10月', amount: 18000 },
    { month: '11月', amount: 25000 },
    { month: '12月', amount: 175000 }, // Dec often high
];
