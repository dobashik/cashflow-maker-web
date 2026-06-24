export type ExpenseItem = {
    id?: string;
    label: string;
    emoji: string;
    amount: number;
    color: string;
    sortOrder: number;
};

export const DEFAULT_EXPENSE_ITEMS: ExpenseItem[] = [
    { label: '家賃', emoji: '🏠', amount: 120000, color: 'bg-rose-400', sortOrder: 0 },
    { label: '食費', emoji: '🍚', amount: 60000, color: 'bg-orange-400', sortOrder: 1 },
    { label: '光熱費', emoji: '💡', amount: 25000, color: 'bg-yellow-400', sortOrder: 2 },
    { label: '携帯代', emoji: '📱', amount: 10000, color: 'bg-green-400', sortOrder: 3 },
    { label: 'デート', emoji: '💐', amount: 40000, color: 'bg-pink-400', sortOrder: 4 },
    { label: '趣味', emoji: '🎨', amount: 45000, color: 'bg-purple-400', sortOrder: 5 },
];
