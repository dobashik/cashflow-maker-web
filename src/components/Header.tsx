import { Castle } from 'lucide-react';
import { Button } from './ui/Button';

export function Header() {
    return (
        <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between backdrop-blur-md bg-white/70 border-b border-white/20 shadow-sm transition-all duration-300 hover:bg-white/90">
            <div className="flex items-center gap-2 cursor-pointer group">
                <div className="p-2 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-300 transition-transform group-hover:scale-110 group-hover:rotate-6">
                    <Castle className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">
                    Cashflow Maker
                </span>
            </div>

            <Button variant="outline" size="sm" className="rounded-full px-6 hover:shadow-md">
                ログイン
            </Button>
        </header>
    );
}
