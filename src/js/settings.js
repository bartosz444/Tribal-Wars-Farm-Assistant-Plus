/*** Imports ***/
let _ = require('lodash');

let Storage = require('./storage');
let constants = require('./const');

// Consts
const SETTINGS_STORAGE_NAME = "Settings";

let Settings = Storage.get(SETTINGS_STORAGE_NAME) || constants.DEFAULT_SETTINGS;

Object.observe(Settings,
  function (changes) {
    Storage.set(SETTINGS_STORAGE_NAME, _.last(changes).object);
  }
);

module.exports = Settings;