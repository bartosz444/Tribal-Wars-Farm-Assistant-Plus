module.exports = {
  /*** Settings ***/
  DEFAULT_SETTINGS : {
    // Defaults
    BotSettings : {
      MIN_RES : 250,
      MAX_RES : 1000,
      MAX_TEMPLATE : "A",
      THRESHOLD_DIST : 6,
      MAX_DIST : 15,
      RAM_UNITS : { spy:1, spear:25, sword:50 },
      RAMS_PER_WALL_LEVEL : [0, 2, 4, 7, 11, 15, 20, 26, 33, 42, 51]
    },
    
    env : "prod",
  },
  
  /*** UI ***/
  SIMULATION_BTN_CLASS : "TWFAP-btn-simulation",
};