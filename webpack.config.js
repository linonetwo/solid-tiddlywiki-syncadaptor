/* eslint-env node */

const path = require('path');
require('dotenv').config();

module.exports = {
  devtool: process.env.NODE_ENV === 'development' ? 'inline-source-map' : false,
  entry: './src/index.js',
  output: {
    filename: 'SyncAdaptor.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'commonjs',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
        },
      },
      { test: /\.json$/, exclude: /node_modules/, use: { loader: 'json-loader' } },
    ],
  },
  optimization: {
    minimize: process.env.NODE_ENV !== 'development',
  },
  node: {
    fs: 'empty',
    net: 'empty',
    tls: 'empty',
  },
  externals: [],
};
