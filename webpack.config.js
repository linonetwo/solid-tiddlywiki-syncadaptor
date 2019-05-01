const path = require('path');
require('dotenv').config();

module.exports = {
  devtool: process.env.NODE_ENV === 'development' ? 'inline-source-map' : false,
  entry: './src/SyncAdaptor.js',
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
    ],
  },
  optimization: {
    minimize: process.env.NODE_ENV !== 'development',
  },
  externals: [],
};
