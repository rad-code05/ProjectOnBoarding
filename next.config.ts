import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Signature uploads are up to 1 MB; multipart adds a little on top.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
