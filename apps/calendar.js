var fs = require('fs');

// Expand express app and helpful functions from parent.
var self = require('../app')
  , app = self.app
  , getSessionUser = self.getSessionUser;


/**
 * Routes
 */

app.get('/calendar', function (req, res) {
  getSessionUser(req, function (err, user) {
    console.log(err, user);
    res.render('calendar.jade', {
      title: 'Olin Apps',
      user: user
    });
  })
})