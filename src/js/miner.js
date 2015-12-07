let $ = require("jquery");
let _ = require("lodash");
let log = require('loglevel').getLogger("Miner");

let PlunderableVillage = require("./data/plunderable-village");
let Miner = require("./miner");



exports.parseResource = function (res_text) {
  "use strict";

  // Raw format: "  1.652 950 2.015 "
  let r =_(res_text)
    .replace(/\./g, "")
    .trim()
    .split(" ")
    .filter(function (x) { return x !== ""; })
    .map(_.parseInt);
    
    return { wood:r[0], stone:r[1], iron:r[2] };
}

exports.parseCoordinates = function (position_text) {
  let pos = /\((\d+)\|(\d+)\)/.exec(position_text);
  return {x : _.parseInt(pos[1]), y : _.parseInt(pos[2]) };  
}

exports.minePlunderVillages = function () {
  "use strict";
  
  let plunderable_villages = [];
  
  // Get villages data
  $("#plunder_list [id*=village_]")
    .each( (index, element) => {
      try {
        let je = $(element);
        
        let tr_id = je.attr("id");
        let id = _.parseInt(_.first(/\d+/.exec(tr_id)));
        let report_id = _.parseInt(_.last(/view=(\d+)/.exec(je.find("a[href*=report]").attr("href"))));
        let coordinates =  Miner.parseCoordinates(je.find("a[href*=report]").text());
        let is_attacking = !_.isEmpty(je.find("img[src*=attack]"));
        let res = Miner.parseResource(je.find("td:nth-child(6)").text());
        let wall = _.parseInt(je.find("td:nth-child(7)").text());
        let distance = parseFloat(je.find("td:nth-child(8)").text());
        
        // Template C
        let template_c_a = je.find("a[data-units-forecast]");
        let template_c = {};
        if(!template_c_a.hasClass("farm_icon_disabled")) {
          template_c = JSON.parse(template_c_a.attr("data-units-forecast"));
        }
        
        // Create object
        let pv = new PlunderableVillage(id, report_id, coordinates, is_attacking, res, wall, distance, template_c);
        
        log.trace("Mined village", pv);
        
        plunderable_villages.push(pv);
        
      } catch (err) {
        log.warn("Unable to mine plunderable village", element, err);
      }    
    }
  );
  
  return plunderable_villages;
};

exports.mineCurrentUnits = function () {
  return window.Accountmanager.farm.current_units;
}

exports.mineTemplates = _.once(function () {
  const DEFAULT_TEMPLATE = {spear : 0, sword : 0, axe : 0, archer : 0, spy : 0, light : 0, marcher : 0, heavy : 0, knight : 0};
  
  let templates = window.Accountmanager.farm.templates;
  let templates_keys = _.keys(window.Accountmanager.farm.templates);
  
  let template_A = _.defaults(templates[_.first(templates_keys)], DEFAULT_TEMPLATE);
  let template_B = _.defaults(templates[_.first(templates_keys)], DEFAULT_TEMPLATE);
  
  templates = {A:template_A, B:template_B};
  
  log.trace("Mined templates", templates);
  
  return templates;
});