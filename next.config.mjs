/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  transpilePackages: ["antd", "@ant-design/icons", "@ant-design/cssinjs"],
  experimental: {
    serverComponentsExternalPackages: ["pg", "drizzle-orm"],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
    };
    return config;
  },
};

export default nextConfig;
