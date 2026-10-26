import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pdf.js (inside unpdf, used to read supplier invoices) must stay a normal Node dependency on the server
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
