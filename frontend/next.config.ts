import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Without this, a package-lock.json in a parent folder can make Next pick the wrong root and fail to find tailwindcss.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
