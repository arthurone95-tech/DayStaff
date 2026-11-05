// Metro configuration for DayStaff.
//
// SheetJS (`xlsx`) contains guarded `require('fs')` / `require('stream')`
// calls for its Node file I/O and streaming APIs. DayStaff only uses the
// in-memory `XLSX.write(...)` path, so we map those Node core modules to an
// empty shim to keep Metro happy.

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const emptyShim = path.resolve(__dirname, 'src/shims/empty.js');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  fs: emptyShim,
  stream: emptyShim,
  crypto: emptyShim,
};

module.exports = config;
