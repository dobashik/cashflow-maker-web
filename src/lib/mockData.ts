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
    { code: '2914', name: 'Japan Tobacco', quantity: 1200, price: 3850, dividendPerShare: 194, sector: 'Foods' }, // Div: 232,800
    { code: '8058', name: 'Mitsubishi Corp', quantity: 800, price: 2980, dividendPerShare: 100, sector: 'Wholesale' }, // Div: 80,000
    { code: '9433', name: 'KDDI', quantity: 500, price: 4450, dividendPerShare: 140, sector: 'Info & Comm' }, // Div: 70,000
    { code: '8306', name: 'MUFG', quantity: 1500, price: 1350, dividendPerShare: 55, sector: 'Banks' }, // Div: 82,500
    { code: '8766', name: 'Tokio Marine', quantity: 400, price: 3900, dividendPerShare: 120, sector: 'Insurance' }, // Div: 48,000
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
