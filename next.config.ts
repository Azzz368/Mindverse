import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    if (dev) {
      const previousIgnored = config.watchOptions?.ignored;
      const ignored = Array.isArray(previousIgnored)
        ? previousIgnored.filter((item): item is string => typeof item === "string" && item.length > 0)
        : typeof previousIgnored === "string" && previousIgnored.length > 0
          ? [previousIgnored]
          : [];
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          ...ignored,
          "**/.mindverse-local/**",
          "**/next-dev.log",
          "**/.codex-*.log",
        ],
      };
    }
    return config;
  },
};
export default nextConfig;
