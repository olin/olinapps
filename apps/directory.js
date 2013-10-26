var fs = require('fs');

// Expand express app and helpful functions from parent.
var self = require('../app')
  , app = self.app
  , getSessionUser = self.getSessionUser
  , db = self.db;


/**
 * Routes
 */

function getDirectory (next) {
  db.users.find(function (err, users) {
    next(err, users && users.map(function (user) {
      user.id = user._id;
      delete user._id;
      user.email = user.id + '@' + user.domain;
      delete user.sessionid;
      return user;
    }));
  });
}


// Returns current years of students from oldest to newest.

function getStudentYears (directory) {
  var years = {};
  directory.forEach(function (student) {
    if (student.domain != 'students.olin.edu') {
      return;
    }
    if (!student.year) {
      console.error('INVALID STUDENT in DATABASE:', student.id, 'has year', student.year);
      return
    }
    years[student.year] = true;
  })
  return Object.keys(years).map(Number).sort().reverse();
}


app.get('/directory', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (!user) {
      return res.redirect('/login');
    }

    getDirectory(function (err, directory) {
      res.render('directory.jade', {
        title: 'Olin Apps',
        directory: directory,
        studentyears: getStudentYears(directory),
        user: user
      });
    })
  })
})


app.post('/directory', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (!user) {
      return res.redirect('/login');
    }

    var keys = ['nickname', 'room', 'phone', 'mail',
      'twitter', 'facebook', 'tumblr', 'skype', 'pinterest', 'lastfm', 'google',
      'preferredemail', 'thumbnail'];
    var update = {};

    keys.forEach(function (key) {
      if (key in req.body) {
        update[key] = String(req.body[key]).substr(0, 256);
      }
    });

    db.users.update({
      _id: user.id
    }, {
      $set: update
    }, function (err) {
      console.error('Updating profile for', user.id, '=>', err || 'OK');
      res.redirect('/directory');
    });
  });
})


// Temporary until template
app.get('/directory/guess', function (req, res, next) {
  getSessionUser(req, function (err, user) {
    if (!user) {
      return res.redirect('/login');
    }

    next();
  })
})


app.get('/api/people', function (req, res) {
  getSessionUser(req, function (err, user) {
    if (!user) {
      return res.redirect('/login');
    }

    getDirectory(function (err, directory) {
      res.json({
        people: directory
      });
    })
  })
})