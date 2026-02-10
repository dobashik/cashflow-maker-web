"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Castle, User as UserIcon, LogOut, ChevronDown } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { type User } from '@supabase/supabase-js';
import { AuthModal } from './AuthModal';

type HeaderProps = {
    onRefreshAnimations?: () => void;
};

export function Header({ onRefreshAnimations }: HeaderProps) {
    const router = useRouter();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [user, setUser] = useState<User | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false); // For mobile menu if needed, or dropdown for user
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false); // ユーザードロップダウンメニュー

    const supabase = createClient();

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);

        // Check initial user
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            window.removeEventListener('scroll', handleScroll);
            subscription.unsubscribe();
        };
    }, []);

    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        e.preventDefault();
        const element = document.getElementById(id);
        if (element) {
            // まずスクロールを実行
            element.scrollIntoView({ behavior: 'smooth' });

            // スクロール完了後にアニメーションを再トリガー
            // smooth scrollの完了を待つため、適度な遅延を設定
            if (onRefreshAnimations) {
                setTimeout(() => {
                    onRefreshAnimations();
                }, 300); // スクロール完了後にアニメーション開始
            }
        }
    };

    const handleLogout = async () => {
        setIsUserMenuOpen(false);
        try {
            await supabase.auth.signOut();
            setUser(null);
            router.refresh();
            window.location.href = '/';
        } catch (error) {
            console.error("Logout error:", error);
        }
    };



    // メニュー外クリックで閉じる
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.user-menu-container')) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    return (
        <>
            <header
                className={`fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between transition-all duration-300 ${isScrolled
                    ? 'backdrop-blur-md bg-white/70 border-b border-white/20 shadow-sm'
                    : 'bg-transparent'
                    }`}
            >
                <Link href="/" className="flex items-center gap-2 cursor-pointer group">
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
                </Link>

                <div className="flex items-center gap-4">
                    <nav className="hidden lg:flex gap-3 whitespace-nowrap">
                        <a
                            href="#dividend-progress"
                            onClick={(e) => handleClick(e, 'dividend-progress')}
                            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            生活費カバー率
                        </a>
                        <a
                            href="#holdings-list"
                            onClick={(e) => handleClick(e, 'holdings-list')}
                            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            保有株式
                        </a>
                        <a
                            href="#sector-analysis"
                            onClick={(e) => handleClick(e, 'sector-analysis')}
                            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            セクター分析
                        </a>
                        <a
                            href="#dividend-calendar"
                            onClick={(e) => handleClick(e, 'dividend-calendar')}
                            className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                        >
                            カレンダー
                        </a>
                    </nav>

                    <div className="pl-4 border-l border-slate-200">
                        {user ? (
                            <div className="flex items-center gap-3">

                                {/* ユーザードロップダウンメニュー */}
                                <div className="relative user-menu-container">
                                    <button
                                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                                        className="flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg px-2 py-1.5 transition-colors"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold border border-indigo-200">
                                            {user.email?.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="hidden lg:inline-block max-w-[120px] truncate">
                                            {user.email}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {/* ドロップダウンメニュー */}
                                    {isUserMenuOpen && (
                                        <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
                                            {/* ユーザー情報 */}
                                            <div className="px-4 py-2 border-b border-slate-100">
                                                <p className="text-xs text-slate-500">ログイン中</p>
                                                <p className="text-sm font-medium text-slate-700 truncate">{user.email}</p>
                                            </div>

                                            {/* メニュー項目 */}
                                            <div className="py-1">
                                                <button
                                                    onClick={handleLogout}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    ログアウト
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2.5 px-5 rounded-full shadow-lg shadow-indigo-200 transition-all hover:scale-105 active:scale-95"
                            >
                                無料で始める / ログイン
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </>
    );
}
