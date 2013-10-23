#!/usr/bin/env node

var olin = require('olin');
var async = require('async');
var mongojs = require('mongojs');

var DRY = true;

var db = mongojs(process.env.MONGOLAB_URI || 'olinapps', ['users']);

if (process.argv.length < 4) {
  console.error('Usage: node update_student_db.js olinusername olinpassword');
  console.error(' -- Use your network credentials to pull down list of all students.')
  process.exit(1);
}

olin.expandDistributionList(process.argv[2], process.argv[3], 'StudentsAll', function (err, data) {
  async.mapSeries(data.filter(function (list) {
    return !list.name.match(/Cross/i);
  }), function (year, next) {
    olin.expandDistributionList(process.argv[2], process.argv[3], year.email_address, function (err, list) {
      next(!list || err, {
        year: year.name,
        list: list
      });
    });
  }, function (err, lists) {
    if (err) {
      console.error('Error in downloading students:', err);
      process.exit(1);
    }

    // Parse data from distribution lists, get a list of students.
    var students = [];
    lists.forEach(function (list) {
      list.list.forEach(function (student) {
        // By default, non-year mailing lists (cross-reg students) get assigned
        // the current year.
        // Also filter for fake accounts like "crossreg".
        var student = {
          year: Number((list.year.match(/\d{4}/) || [])[0] || (new Date).getFullYear()),
          name: student.name,
          id: (student.email_address || '').replace(/@.*$/, '').toLowerCase(),
          domain: student.email_address.replace(/^.*?@/, '').toLowerCase()
        }

        if (student.id != 'crossreg' && student.id != 'joseph.student') {
          students.push(student);
        }
      })
    });

    console.log(students);

    if (DRY) {
      console.error('DRY RUN. Set dry = false to make this work')
    }

    // Now update this list of students in the db.
    students.forEach(function (student) {
      // Don't "update" the ID. Set name as "nickname" can override it.
      var id = student.id;
      delete student.id;
      console.log('updating', id, '...');
      db.users.update({
        _id: id
      }, {
        $set: student
      }, {
        upsert: true
      }, function (err) {
        console.log('--> updated', id, '=', err || 'OK')
      })
    })
  });
})