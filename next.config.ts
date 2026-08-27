import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@etothepii/satisfactory-file-parser", "nodemailer"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
