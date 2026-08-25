/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The SDK ships TypeScript source, not a build artifact. One less build step and
  // the ABI types stay live across the workspace.
  transpilePackages: ["@drip/sdk"],
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
