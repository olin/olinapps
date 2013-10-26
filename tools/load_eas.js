#!/usr/bin/env node

var fs = require('fs');

// npm install csv olin async mongojs
var csv = require('csv');
var olin = require('olin');
var async = require('async');
var mongojs = require('mongojs');

var db = mongojs(process.env.MONGOLAB_URI || 'olinapps', ['users']);

var DRY = true;

if (process.argv.length < 3) {
  console.error('Usage: load_eas.js path/to.csv');
  process.exit(1);
}

csv().from.string(fs.readFileSync(process.argv[2], 'utf-8')).to.array(function (csv) {
  var header = csv.shift();

  var students = csv.map(function (student) {
    var obj = {};
    for (var i = 0; i < student.length; i++) {
      if (header[i]) {
        obj[header[i].toLowerCase().replace(/\s+/g, '').replace(/[^\w]/g, '_')] = student[i];
      }
    }
    return obj;
  })

  // Now the fun begins
  db.users.distinct('_id', function (err, users) {
    students.forEach(function (stu) {
      if (!stu.first || stu.class.toLowerCase() == 'exchange' || Number(stu.class) <= 2013) {
        return;
      }

      var id = (stu.first.toLowerCase() + '.' + stu.last.toLowerCase()).replace(/[\s\']/g, '');
      if (users.indexOf(id) > -1) {
        // console.log('found');
        // if (!DRY) {
          // console.log('Updating', id, '...');
          db.users.findOne({
            _id: id,
          }, function (err, user) {
            if (!user.phone) {
              user.phone = stu.phone;
            }
            if (!user.mail) {
              user.mail = stu.mail;
            }
            console.log('Updating', id + ':', user);
            if (!DRY) {
              db.users.save(user, function (err) {
                console.log(' --> updated', id, '=>', err || 'OK');
              });
            }
          })
        // }
      } else {
        console.error('!!! could not find', id, stu.class);
      }
    })
  });
});