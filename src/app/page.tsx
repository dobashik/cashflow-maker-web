import { Header } from '@/components/Header';
import { DividendGame } from '@/components/DividendGame';
import { PortfolioPie } from '@/components/PortfolioPie';
import { HoldingsTable } from '@/components/HoldingsTable';

export default function Home() {
  return (
    <main className="min-h-screen pb-20 bg-slate-50 selection:bg-indigo-100 selection:text-indigo-900">
      <Header />

      {/* Spacer for fixed header */}
      <div className="h-24"></div>

      <div className="container mx-auto px-4 space-y-12">

        {/* Hero Section Text */}
        <div className="text-center max-w-2xl mx-auto mt-8 mb-4 space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-indigo-900 leading-tight">
            配当金で、<br />人生の選択肢を増やそう。
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed">
            退屈な表計算ソフトはもう卒業。あなたの配当金が「魔法の水」となって生活費を満たしていく様子を、美しいビジュアルで管理しましょう。
          </p>
          <button className="bg-gradient-to-r from-amber-400 to-orange-400 text-white font-bold py-3 px-8 rounded-full shadow-lg shadow-amber-200 hover:shadow-xl hover:scale-105 transition-all duration-300">
            デモを体験する
          </button>
        </div>

        {/* Hero / Game Section */}
        <div className="w-full">
          <DividendGame />
        </div>

        {/* Dashbaord Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          <div className="flex flex-col gap-8">
            <PortfolioPie />

            {/* Decoration Card */}
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden transform hover:scale-[1.02] transition-transform duration-500">
              <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-2">Next Dividend</h3>
                <p className="text-indigo-200 mb-6">Estimated arrival for Japan Tobacco</p>
                <div className="text-4xl font-black">¥232,800</div>
                <div className="mt-2 text-indigo-300">September 28, 2025</div>
              </div>
              {/* Decor circles */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl animate-pulse" />
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-amber-400/20 rounded-full blur-xl" />
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <HoldingsTable />
          </div>
        </div>
      </div>
    </main>
  );
}
