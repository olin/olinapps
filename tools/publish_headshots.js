#!/usr/bin/env node

console.log('Assuming headshots are in ./headshots/ directory...');

var DRY = false;

var fs = require('fs');
var olin = require('olin');
var async = require('async');
var mongojs = require('mongojs');

var db = mongojs(process.env.MONGOLAB_URI || 'olinapps', ['users']);

db.users.find(function (err, users) {
  if (err) {
    console.error('Error connecting to DB:', err);
  }

  var students = {};
  users.forEach(function (user) {
    students[user._id] = user;
  })

  fs.readdirSync('./headshots').forEach(function (file) {
    // weird cahracters
    var file = file.replace(/[^\.\-0-9a-z]/g, '');
    // extension
    var ext = '.' + file.replace(/^.*\./, '');
    // var segs = file.replace(/\.\w+$/, '')
    // var lastname = segs.split('-');
    // var firstname = lastname.pop();
    // lastname = lastname.join('-');
    // var name = firstname + '.' + lastname;
    var name = file.replace(/\.\w+$/, '');

    console.log(name, name in students ? '=> matched.' : '=> NO MATCH. Please rename.');
    if (name in students) {
      var from = './headshots/' + file;
      var to = '../public/static/headshots/' + name + ext;
      console.log('  mv', from, '->', to);
      if (!DRY) {
        fs.renameSync(from, to);

        db.users.update({
          _id: name
        }, {
          $set: {
            thumbnail: '/static/headshots/' + name + ext
          }
        }, function (err, users) {
          console.log('  set avatar.');
        })
      }
    }
  })
});