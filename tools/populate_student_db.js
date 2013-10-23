#!/usr/bin/env node

var olin = require('olin');
var async = require('async');

if (process.argv.length < 4) {
  console.error('Usage: populate_student_db.sh yourusername yourpassword');
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
        students.push({
          year: Number((list.year.match(/\d{4}/) || [])[0] || (new Date).getFullYear()),
          name: student.name,
          id: (student.email_address || '').replace(/@.*$/, '').toLowerCase(),
          domain: student.email_address.replace(/^.*?@/, '').toLowerCase()
        });
      })
    });

    // Now add this list of students to the db.
    console.log(students);
  });
})