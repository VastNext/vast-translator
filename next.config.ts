import type { NextConfig } from "next";

// 自托管（Docker）构建需设置 NEXT_OUTPUT_MODE=standalone 以产出 .next/standalone；
// Vercel 构建保持默认输出，不受影响。
const nextConfig: NextConfig = {
  output: process.env.NEXT_OUTPUT_MODE === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
