/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // Self-contained server (.next/standalone/server.js) for the Docker image — see Dockerfile.
  output: "standalone",
  reactStrictMode: false,
  transpilePackages: ["antd", "@ant-design/icons", "@ant-design/cssinjs"],
  // Same as the reference Docker project: a type / lint warning must not stop the server image from building.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

export default nextConfig;
