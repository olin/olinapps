var fs = require('fs');

// Expand express app and helpful functions from parent.
var self = require('../app')
  , app = self.app
  , getSessionUser = self.getSessionUser;


/**
 * Routes
 */

app.get('/launchpad', function (req, res) {
  getSessionUser(req, function (err, user) {
    console.log(err, user);
    res.render('launchpad.jade', {
      title: 'Olin Apps',
      user: user
    });
  })
})