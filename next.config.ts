import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF record reads its fonts and the logo from disk at run time:
  // ship them with the functions that make it (F08c).
  outputFileTracingIncludes: {
    "/records/*": ["./lib/records/fonts/*.ttf", "./public/brand/*.png"],
    "/approvals/*": ["./lib/records/fonts/*.ttf", "./public/brand/*.png"],
    // Report PDFs (F12d) use the same fonts and logo.
    "/reports/*": ["./lib/records/fonts/*.ttf", "./public/brand/*.png"],
  },
  experimental: {
    serverActions: {
      // Signature uploads are up to 1 MB; multipart adds a little on top.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
