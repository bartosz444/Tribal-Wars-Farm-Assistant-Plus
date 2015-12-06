let $ = require("jquery");
let _ = require("lodash");
let log = require('loglevel').getLogger("PlunderableVillage");

let util = require("./../util");



module.exports = class PlunderableVillage {
  constructor (id, report_id, coordinates, is_attacking, res, wall, distance, template_c) {
    "use strict";
    
    this.id = id;
    this.report_id = report_id;
    this.coordinates = coordinates;
    this.is_attacking = is_attacking;
    this.res = res;
    this.wall = wall;
    this.distance = distance;
    this.template_c = template_c;
  }
  
  get TR () {
    "use strict"
    
    return $('#' + this.tr_id).first();
  }
  
  get tr_id () {
    return "village_" + this.id;
  }
  
  getTotalRes () {
    "use strict";
    
    return _.sum(_.values(this.res));
  }
  
  getOrderButton (order_letter) {
    if (!util.isValidOrderLetter(order_letter)) { // order_letter isn't a, b or c
      throw new Error ('"' + order_letter + '"is not a valid order_letter. Must be A, B or C (case insensitive).');
    }
    
    order_letter = order_letter.toLowerCase();
    
    let query = ".farm_icon_" + order_letter;  
    return this.TR.find(query);
  }
  
  isOrderAvaiable (order_letter) {
    return this.getOrderButton(order_letter).hasClass("farm_icon_disabled");
  }
  
  get attack_place_button () {
    return this.TR.find("img[src*=place]");
  }
  
  clickOrder (order_letter) {
    log.info("clicked", order_letter, this);
    this.getOrderButton(order_letter).click();
  }
}