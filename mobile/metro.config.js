const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// lib/ ligger i repoets rod og deles med serveren (architecture 13.2).
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../lib")];
// zod i lib/ skal findes i mobile/node_modules.
config.resolver.nodeModulesPaths = [path.resolve(__dirname, "node_modules")];

module.exports = config;
