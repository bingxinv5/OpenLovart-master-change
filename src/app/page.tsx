import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <main className="flex flex-col items-center justify-center gap-8 px-8 py-16">

        {/* CTA Button */}
        <Link
          href="/projects"
          className="px-8 py-4 bg-black text-white rounded-full text-lg font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
        >
          开始创作 →
        </Link>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 max-w-4xl">
          <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-3xl mb-3">🎨</div>
            <h3 className="font-semibold text-gray-900 mb-2">智能设计</h3>
            <p className="text-sm text-gray-600">
              AI 助手帮你生成创意设计方案
            </p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-3xl mb-3">✨</div>
            <h3 className="font-semibold text-gray-900 mb-2">图像生成</h3>
            <p className="text-sm text-gray-600">
              输入描述即可生成高质量图片
            </p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="text-3xl mb-3">🚀</div>
            <h3 className="font-semibold text-gray-900 mb-2">本地优先</h3>
            <p className="text-sm text-gray-600">
              项目默认保存在当前浏览器，适合团队内部高频创作
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
