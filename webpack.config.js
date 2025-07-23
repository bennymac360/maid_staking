const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    // Define the entry point of your application
    entry: './src/index.js',

    // Define the output bundle location
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true, // cleans the output directory before each build
    },

    // Set the mode to development unless explicitly stated as production
    mode: isProduction ? 'production' : 'development',

    // Enable source maps in development for easier debugging
    devtool: isProduction ? 'source-map' : 'eval-source-map',

    // Configure how modules are resolved
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    },

    module: {
      rules: [
        {
          test: /\.[jt]sx?$/, // Matches .js, .jsx, .ts, and .tsx
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              // Use Babel presets to compile modern JS, JSX, and TS
              presets: [
                '@babel/preset-env',      // Transpile JS for older browsers
                '@babel/preset-react',    // Transpile JSX to JS
                '@babel/preset-typescript'// Transpile TypeScript to JS
              ],
            },
          },
        },
        // You can add more rules here for handling CSS, images, etc.
      ],
    },
    

    // If you'd like to run a development server
    devServer: {
      static: {
        directory: path.join(__dirname, 'public'),
      },
      compress: true,
      port: 3000,
      historyApiFallback: true, // For React Router
      open: true,
    },

    // Additional plugins can be configured here if needed
    plugins: [
      // For example, you can add HtmlWebpackPlugin to generate index.html
      // new HtmlWebpackPlugin({
      //   template: './public/index.html'
      // })
    ],
  };
};
