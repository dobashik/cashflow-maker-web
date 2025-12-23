import { Castle } from 'lucide-react';
import { Button } from './ui/Button';

type HeaderProps = {
    onRefreshAnimations?: () => void;
};

export function Header({ onRefreshAnimations }: HeaderProps) {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        // Allow default anchor behavior (scrolling)
        if (onRefreshAnimations) {
            // Tiny delay to ensure scroll starts or just let it happen
            onRefreshAnimations();
        }
    };

    return (
        <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between backdrop-blur-md bg-white/70 border-b border-white/20 shadow-sm transition-all duration-300 hover:bg-white/90">
            <div className="flex items-center gap-2 cursor-pointer group">
                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-300 transition-transform group-hover:scale-110 group-hover:rotate-6">
                    <Castle className="w-6 h-6 text-white" />
                </div>
                <div className="flex flex-col">
                    <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
                        Cashflow Maker
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 tracking-wider" style={{ fontFamily: 'var(--font-zen-maru)' }}>
                        日本高配当株ポートフォリオ
                    </span>
                </div>
            </div>

            <nav className="flex gap-4">
                <a
                    href="#holdings-list"
                    onClick={(e) => handleClick(e, 'holdings-list')}
                    className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                >
                    保有株式リスト
                </a>
                <a
                    href="#analysis-report"
                    onClick={(e) => handleClick(e, 'analysis-report')}
                    className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                >
                    分析レポート
                </a>
                <a
                    href="#dividend-calendar"
                    onClick={(e) => handleClick(e, 'dividend-calendar')}
                    className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                >
                    配当カレンダー
                </a>
            </nav>
        </header>
    );
}
