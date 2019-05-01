const path = require('path');
require('dotenv').config()

module.exports = {
  target: 'node',
  devtool: process.env.NODE_ENV === 'development' ? 'inline-source-map' : false,
  entry: './src/SyncAdaptor.js',
  output: {
    filename: 'SyncAdaptor.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    publicPath: '/dist/',
    umdNamedDefine: false,
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
  externals: [],
};
