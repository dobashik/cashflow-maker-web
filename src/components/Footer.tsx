'use client';

import Link from 'next/link';

export function Footer() {
    return (
        <footer className="bg-slate-900 text-slate-400 py-8 mt-12">
            <div className="container mx-auto px-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-center md:text-left">
                        <p className="text-sm">
                            © {new Date().getFullYear()} Cashflow Maker. All rights reserved.
                        </p>
                    </div>

                    <nav className="flex gap-6 text-sm">
                        <Link
                            href="/legal/tokushoho"
                            className="hover:text-white transition-colors"
                        >
                            特定商取引法に基づく表記
                        </Link>
                    </nav>
                </div>
            </div>
        </footer>
    );
}
