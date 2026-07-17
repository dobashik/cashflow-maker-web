import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // Server Actions を Node.js ランタイムで強制実行（Edge runtime では process.env が動作しないため）
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
