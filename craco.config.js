// craco.config.js
const webpack = require('webpack');
const WebpackObfuscator = require('webpack-obfuscator');

module.exports = {
  webpack: {
    configure: (webpackConfig, { env }) => {
      // Existing fallbacks
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        "stream": require.resolve("stream-browserify"),
        "assert": require.resolve("assert/"),
        "util": require.resolve("util/"),
        "http": require.resolve("stream-http"),
        "https": require.resolve("https-browserify"),
        "os": require.resolve("os-browserify/browser"),
        "url": require.resolve("url/"),
        "buffer": require.resolve("buffer")
      };

      

      // Force exclude node_modules from source-map-loader
      // Some versions of react-scripts/CRACO may not have source-map-loader by default.
      // If source-map-loader is present, add the rule here:
      webpackConfig.module.rules.push({
        test: /\.js$/,
        enforce: 'pre',
        exclude: '/node_modules/',
        use: ['source-map-loader'],
      });

      // Ignore the specific source map warning
      webpackConfig.ignoreWarnings = (webpackConfig.ignoreWarnings || []).concat([
        /Failed to parse source map/
      ]);

      // Provide Buffer if needed
      webpackConfig.plugins = (webpackConfig.plugins || []).concat([
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
        })
      ]);

      // Obfuscate in production only
      if (env === 'production') {
        webpackConfig.plugins.push(
          new WebpackObfuscator({
            rotateStringArray: true,
          })
        );
      }

      return webpackConfig;
    },
  },
};
