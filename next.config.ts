import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serverless ERP: keep server bundles lean for cold-start performance
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
