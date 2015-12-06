/* global GM_setValue */
/* global GM_getValue */
  
let _ = require("lodash");

exports.get = function (name, defaulty) {
  return GM_getValue(name, defaulty); 
}

exports.set = function (name, value) {
  return GM_setValue(name, value);
} 