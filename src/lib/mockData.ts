export type ExpenseBlock = {
    id: string;
    label: string;
    amount: number;
    color: string;
};

export type Holding = {
    code: string;
    name: string;
    quantity: number;
    price: number;
    dividendPerShare: number;
    sector: string;
};

export const EXPENSES: ExpenseBlock[] = [
    { id: 'rent', label: 'Rent', amount: 80000, color: 'bg-rose-400' },
    { id: 'food', label: 'Food', amount: 40000, color: 'bg-orange-400' },
    { id: 'util', label: 'Utility', amount: 15000, color: 'bg-yellow-400' },
    { id: 'phone', label: 'Phone', amount: 8000, color: 'bg-green-400' },
    { id: 'date', label: 'Date', amount: 30000, color: 'bg-pink-400' },
    { id: 'hobby', label: 'Hobby', amount: 20000, color: 'bg-purple-400' },
];

export const HOLDINGS: Holding[] = [
    { code: "2914", name: "日本たばこ産業 (JT)", price: 3850, quantity: 1200, dividendPerShare: 194, sector: "食料品" },
    { code: "8058", name: "三菱商事", price: 2980, quantity: 800, dividendPerShare: 100, sector: "卸売業" },
    { code: "9433", name: "KDDI", price: 4450, quantity: 500, dividendPerShare: 140, sector: "情報・通信業" },
    { code: "8306", name: "三菱UFJフィナンシャルG", price: 1350, quantity: 1500, dividendPerShare: 55, sector: "銀行業" },
    { code: "8766", name: "東京海上HD", price: 5200, quantity: 300, dividendPerShare: 159, sector: "保険業" },
    { code: "8593", name: "三菱HCキャピタル", price: 980, quantity: 2000, dividendPerShare: 40, sector: "その他金融業" },
    { code: "6301", name: "コマツ", price: 3900, quantity: 400, dividendPerShare: 120, sector: "機械" },
    { code: "1928", name: "積水ハウス", price: 3400, quantity: 600, dividendPerShare: 125, sector: "建設業" }
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
