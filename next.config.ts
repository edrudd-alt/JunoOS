import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer uses Node.js-only APIs (canvas, font buffers, etc.)
  // and must never be bundled for the browser or Edge Runtime.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
