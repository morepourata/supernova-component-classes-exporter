const TerserPlugin = require("terser-webpack-plugin")
const path = require("path")

module.exports = (env, argv) => ({
  mode: argv.mode === "production" ? "production" : "development",
  devtool: argv.mode === "production" ? false : "inline-source-map",
  entry: {
    code: "./src/index.ts",
  },
  module: {
    rules: [{ test: /\.tsx?$/, use: "ts-loader", exclude: /node_modules/ }],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
    fallback: {
      fs: false, path: false, stream: false, crypto: false,
      http: false, https: false, url: false, util: false,
    },
  },
  output: {
    filename: "build.js",
    path: path.resolve(__dirname, "./dist/"),
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({ extractComments: false })],
  },
})
