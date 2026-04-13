'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@/lib/mock-clerk';
import { SettingsCenterContent } from '@/components/lovart/ApiSettingsDialog';

export default function UserPage() {
    const { user } = useUser();

    return (
        <div className="min-h-screen bg-[#f7f7f8] text-gray-900 font-sans">
            <main className="h-full flex flex-col overflow-hidden">
                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Top Bar */}
                    <div className="flex items-center justify-end px-8 py-4">

                        <div className="flex items-center gap-2">
                            <button title="查看通知" className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative">
                                <Bell size={18} className="text-gray-600" />
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                            </button>

                            <SignedOut>
                                <SignInButton mode="modal">
                                    <button className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
                                        登录
                                    </button>
                                </SignInButton>
                            </SignedOut>
                            <SignedIn>
                                <UserButton />
                            </SignedIn>
                        </div>
                    </div>

                    <div className="px-4 pb-8 md:px-8">
                    {!user ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <div className="text-center max-w-md">
                                <h2 className="text-2xl font-bold mb-4">欢迎来到 PixelForge</h2>
                                <p className="text-gray-600 mb-6">登录后可统一管理 API、工作台偏好与生成默认值</p>
                                <SignInButton mode="modal">
                                    <button className="px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors">
                                        立即登录
                                    </button>
                                </SignInButton>
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-4xl mx-auto">
                            <div className="mb-4 px-6">
                                <h1 className="text-2xl font-bold tracking-tight text-gray-900">账户与设置</h1>
                                <p className="mt-1 text-sm text-gray-500">这里集中管理接口配置、工作台行为、CDN 缓存目录，以及图片 / 视频生成默认值。</p>
                            </div>
                            <SettingsCenterContent mode="page" />
                        </div>
                    )}
                    </div>
                </div>
            </main>
        </div>
    );
}
