"use strict";

let $ = require("jquery");
let _ = require("lodash");
let log = require('loglevel');

let Settings = require("./settings");

function setLogLevel () {
  if (Settings.env === "dev") {
    log.setLevel(log.levels.TRACE, false);  
  } else {
    log.setLevel(log.levels.ERROR, false);
  }  
}
setLogLevel();

let UI = require("./ui");

/*** Global Fns ***/
window.TWFAP_Toggle_Env = function () {
  Settings.env = (Settings.env === "prod") ? "dev" : "prod";
  setLogLevel();
  
  console.log("Enviroment is now:", Settings.env);
}


/*** Execution ***/
UI.injectUI();