/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large audio file uploads (up to 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    serverComponentsExternalPackages: ["music-metadata", "pronouncing"],
  },
};

export default nextConfig;
