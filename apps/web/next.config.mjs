/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /*
   * The hero photograph is a 1.7 MB PNG with an alpha channel and it is the LCP
   * element on the busiest page. Served as AVIF at the size actually rendered it is
   * roughly a tenth of that. `sharp` does the encoding and is a declared dependency
   * for exactly this reason — Next reaches for it at request time, not at build time,
   * so a green build is no evidence it is installed.
   */
  images: { formats: ["image/avif", "image/webp"] },
  // The SDK ships TypeScript source, not a build artifact. One less build step and
  // the ABI types stay live across the workspace.
  transpilePackages: ["@drip-markets/sdk"],
  webpack: (config, { webpack }) => {
    // Wallet connectors reach, through several layers, for peers this app never runs:
    // a paid request signer, a react native storage shim, a pretty logger, a node only
    // database, a text encoder polyfill. None are installed and none are executed.
    // Ignoring them is correct. Failing the build on them is not, and marking them
    // external is worse: webpack emits their package names as bare identifiers and the
    // minifier chokes on the slashes.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(@x402\/|@react-native-async-storage\/|pino-pretty$|lokijs$|encoding$)/,
      })
    );
    return config;
  },
};

export default nextConfig;
