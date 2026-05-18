/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ensure the data/ JSONs (loaded dynamically by lib/recommender.ts) are
  // bundled into the serverless function output on Vercel/Node builds.
  outputFileTracingIncludes: {
    "/api/recommend": ["./data/**/*.json"],
  },
};
export default nextConfig;
