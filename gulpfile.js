'use strict';

let fs = require('fs');
let assign = require('lodash').assign;
let source = require('vinyl-source-stream');
let buffer = require('vinyl-buffer');
let browserify = require('browserify');
let watchify = require('watchify');
let gulp = require('gulp');
let gutil = require('gulp-util');
let sourcemaps = require('gulp-sourcemaps');
let header = require('gulp-header');
let gulpif = require('gulp-if');
let uglify = require('gulp-uglify');

// Consts
const DEST_PATH = './build/';
const JS_PATH   = 'src/js/**/*.js'; 


let env = process.env.NODE_ENV || 'dev';


gulp.task('js', () => {  
  let b = browserify({
    entries: ['./src/js/index.js'],
    debug:(env === 'dev')
  });
  
  let outFileName = (env == 'prod') ? 'TribalWarsFAP.user.js' : 'TribalWarsFAP.dev.js'; 
  
  return b.bundle()
    .pipe(source(outFileName)) // Define nome do arquivo de saida.
    .pipe(buffer()) // Transforma stream em buffer, requerido para uglify/header.
    .pipe(gulpif(env === 'prod', uglify())) // Executa uglify apenas se for para produção.
    .pipe(header(fs.readFileSync('./src/js/header.js', 'utf8') + "\n")) // Adiciona header do UserScript.
    .pipe(gulp.dest(DEST_PATH));
});

gulp.task('default', ['js']);

gulp.task('watch', ['default'], () => {
  gulp.watch(JS_PATH, ['js']);
});



// add custom browserify options here
let customOpts = {
  entries: ['./src/index.js'],
  debug: true
};
let opts = assign({}, watchify.args, customOpts);
let b = watchify(browserify(opts)); 

// add transformations here
// i.e. b.transform(coffeeify);

gulp.task('build-dev-watch', bundle); // so you can run `gulp js` to build the file
b.on('update', bundle); // on any dep update, runs the bundler
b.on('log', gutil.log); // output build logs to terminal

function bundle() {
  return b.bundle()
    // log errors if they happen
    .on('error', gutil.log.bind(gutil, 'Browserify Error'))
    .pipe(source('TribalWarsFarm+.dev.js'))
    // optional, remove if you don't need to buffer file contents
    .pipe(buffer())
    // optional, remove if you dont want sourcemaps
    //.pipe(sourcemaps.init({loadMaps: true})) // loads map from browserify file
       // Add transformation tasks to the pipeline here.
    //.pipe(sourcemaps.write('./')) // writes .map file
    .pipe(header(fs.readFileSync('./src/js/header.js', 'utf8')))
    .pipe(gulp.dest('./build'));
}