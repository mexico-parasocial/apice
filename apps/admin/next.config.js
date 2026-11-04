/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    // Course thumbnails and avatars are uploaded to Cloudinary.
    domains: ["res.cloudinary.com"],
  },
};

module.exports = nextConfig;
